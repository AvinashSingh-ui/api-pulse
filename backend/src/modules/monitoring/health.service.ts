import type { Endpoint, EndpointStatus, RequestLog } from '../../types/index.js';

export interface HealthScoreResult {
  healthScore: number;
  status: EndpointStatus;
  degradationReason?: string;
  uptime: number;
  responseTimeP50: number;
  responseTimeP95: number;
  responseTimeP99: number;
}

export const healthService = {
  /**
   * Cleans and normalizes project base URL.
   * Strips Swagger UI, API doc page suffixes, and trailing slashes.
   */
  cleanBaseUrl(baseUrl: string): string {
    let clean = (baseUrl || '').trim();
    // Strip trailing slashes first
    clean = clean.replace(/\/+$/, '');
    // Strip swagger-ui or docs paths if entered by mistake as base URL
    clean = clean.replace(/\/(swagger-ui(\/index\.html)?|swagger-ui\.html|api-docs|docs)$/i, '');
    return clean.replace(/\/+$/, '');
  },

  /**
   * Safe URL construction:
   * Strips trailing slashes from baseUrl, ensures a leading slash on path,
   * resolves path parameters with test values if needed,
   * prevents double slashes (e.g. https://httpbin.org/ + /get -> https://httpbin.org/get).
   */
  buildFullUrl(baseUrl: string, path: string, pathParams?: Record<string, string>): string {
    const cleanBase = this.cleanBaseUrl(baseUrl);
    let resolvedPath = (path || '').trim();

    // Resolve path parameters e.g. /users/{id} or /documents/preview/:token
    resolvedPath = resolvedPath.replace(/\{([a-zA-Z0-9_-]+)\}|:([a-zA-Z0-9_-]+)/g, (match, p1, p2) => {
      const key = p1 || p2;
      if (pathParams && pathParams[key] !== undefined) {
        return encodeURIComponent(pathParams[key]);
      }
      const lower = key.toLowerCase();
      if (lower.includes('country') || lower.includes('countries')) return 'US';
      if (lower.includes('provideraccount')) return 'acc_1';
      if (lower.includes('provider')) return 'custom';
      if (lower.includes('entity') || lower.includes('type')) return 'customer';
      if (lower.includes('account') || lower.includes('contact') || lower.includes('lead') || lower.includes('process')) return '1';
      if (lower.includes('uuid') || lower.includes('id')) return '00000000-0000-0000-0000-000000000001';
      if (lower.includes('num') || lower.includes('count') || lower.includes('page') || lower.includes('limit')) return '1';
      if (lower.includes('token') || lower.includes('jwt') || lower.includes('hash')) return 'test_token';
      if (lower.includes('name') || lower.includes('slug') || lower.includes('item')) return 'sample_item';
      if (lower.includes('email')) return 'test%40example.com';
      if (lower.includes('date')) return '2026-01-01';
      return '1';
    });

    const cleanPath = resolvedPath.replace(/^\/+/, '/');
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    return `${cleanBase}${normalizedPath}`;
  },

  /**
   * Validate that the base URL and path produce a syntactically valid HTTP/HTTPS URL.
   */
  validateEndpointUrl(baseUrl: string, path: string): { isValid: boolean; fullUrl: string; error?: string } {
    if (!baseUrl || !baseUrl.trim()) {
      return { isValid: false, fullUrl: '', error: 'Project base URL is missing or empty' };
    }
    if (!path || !path.trim()) {
      return { isValid: false, fullUrl: '', error: 'Endpoint path cannot be empty' };
    }
    if (path.includes(' ') || /[\n\r\t]/.test(path)) {
      return { isValid: false, fullUrl: '', error: 'Endpoint path contains illegal whitespace characters' };
    }

    const fullUrl = this.buildFullUrl(baseUrl, path);
    try {
      const parsed = new URL(fullUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { isValid: false, fullUrl, error: `Invalid protocol: "${parsed.protocol}". Only HTTP and HTTPS are supported.` };
      }
      return { isValid: true, fullUrl };
    } catch {
      return { isValid: false, fullUrl, error: `Constructed URL "${fullUrl}" is invalid. Please verify base URL and path.` };
    }
  },

  /**
   * Calculate P50, P95, and P99 response times from an array of measured latencies.
   */
  calculatePercentiles(responseTimes: number[]): { p50: number; p95: number; p99: number } {
    if (!responseTimes.length) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...responseTimes].sort((a, b) => a - b);
    const n = sorted.length;

    const p50 = sorted[Math.floor(n * 0.5)];
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
    const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];

    return {
      p50: Math.round(p50),
      p95: Math.round(p95),
      p99: Math.round(p99),
    };
  },

  /**
   * Evaluates whether a given HTTP status code is accepted for the endpoint.
   */
  isStatusAccepted(statusCode: number, expectedStatus = 200, acceptedStatuses?: number[]): boolean {
    if (statusCode === expectedStatus) return true;
    if (acceptedStatuses && acceptedStatuses.includes(statusCode)) return true;
    // Standard successful REST status codes when expectedStatus is in 2xx family
    if (expectedStatus >= 200 && expectedStatus < 300 && statusCode >= 200 && statusCode < 300) {
      return true;
    }
    return false;
  },

  /**
   * Calculate uptime percentage from historical request logs.
   * Uptime is the ratio of successful checks (matching expected status) to total checks.
   */
  calculateUptime(logs: RequestLog[], expectedStatus = 200, acceptedStatuses?: number[]): number {
    if (!logs.length) return 100.0;
    const successful = logs.filter(l => this.isStatusAccepted(l.statusCode, expectedStatus, acceptedStatuses)).length;
    return Number(((successful / logs.length) * 100).toFixed(2));
  },

  /**
   * Comprehensive API Health Scoring Algorithm:
   * 
   * 1. Health is calculated INDEPENDENTLY from uptime:
   *    - An API returning HTTP 200 after 3000ms has 100% uptime, but its health score drops to Degraded!
   * 2. Considers:
   *    - Current HTTP status code and failure type
   *    - Current response latency vs configured latencyThresholdMs (default 500ms)
   *    - Recent error rate in historical logs (last 10-20 requests)
   *    - Recovery rate from consecutive healthy checks
   * 3. Thresholds:
   *    - Healthy: 90 - 100
   *    - Degraded: 50 - 89
   *    - Unhealthy / Down: 0 - 49
   */
  calculateHealth(params: {
    currentStatusCode: number;
    currentResponseTime: number;
    expectedStatus?: number;
    acceptedStatuses?: number[];
    latencyThresholdMs?: number;
    failureType?: RequestLog['failureType'];
    recentLogs?: RequestLog[];
    timeout?: number;
  }): HealthScoreResult {
    const {
      currentStatusCode,
      currentResponseTime,
      expectedStatus = 200,
      acceptedStatuses,
      latencyThresholdMs = 500,
      failureType = 'none',
      recentLogs = [],
      timeout = 5000,
    } = params;

    const allLatencies = [
      currentResponseTime,
      ...recentLogs.filter(l => l.responseTime > 0).map(l => l.responseTime),
    ];
    const percentiles = this.calculatePercentiles(allLatencies);
    const uptime = this.calculateUptime(recentLogs, expectedStatus, acceptedStatuses);

    let score = 100;
    let degradationReason: string | undefined;

    // --- Factor 1: Status Code & Availability Penalties ---
    const isServerError = currentStatusCode >= 500 && expectedStatus !== currentStatusCode;
    const isNetworkFailure = failureType === 'connection_refused' || failureType === 'timeout' || failureType === 'network_error';
    const isStatusMatch = this.isStatusAccepted(currentStatusCode, expectedStatus, acceptedStatuses);
    const isStatusMismatch = !isStatusMatch;
    // Auth failure is only penalized if the status was NOT accepted/expected
    const isAuthFailure = (failureType === 'auth_failure' || currentStatusCode === 401 || currentStatusCode === 403) && isStatusMismatch;

    if (isServerError || isNetworkFailure) {
      // Severe drop: Unhealthy status
      score -= 75;
      if (failureType === 'timeout') {
        degradationReason = `Request timed out after ${timeout}ms`;
      } else if (failureType === 'connection_refused') {
        degradationReason = 'Connection refused by target server';
      } else if (isServerError) {
        degradationReason = `HTTP ${currentStatusCode} Internal Server Error`;
      } else {
        degradationReason = 'Network failure: Host unreachable';
      }
    } else if (isAuthFailure) {
      // Authentication / Authorization Failure when unexpected
      score -= 50;
      degradationReason = `Authentication/Permission Error: HTTP ${currentStatusCode} (${currentStatusCode === 401 ? 'Unauthorized' : 'Forbidden'})`;
    } else if (isStatusMismatch) {
      // Moderate drop: Degraded status
      score -= 35;
      degradationReason = `Unexpected HTTP ${currentStatusCode} (Expected ${expectedStatus})`;
    } else if (isStatusMatch) {
      if (!degradationReason) {
        degradationReason = `Optimal status (HTTP ${currentStatusCode} ${currentStatusCode === 204 ? 'No Content' : currentStatusCode === 201 ? 'Created' : 'OK'})`;
      }
    }

    // --- Factor 2: Latency Performance Penalties ---
    // A successful HTTP 200 with high latency MUST drop the health score!
    if (currentResponseTime > latencyThresholdMs) {
      const ratio = currentResponseTime / latencyThresholdMs;
      let latencyPenalty = 0;

      if (ratio > 2.5) {
        latencyPenalty = 45;
      } else if (ratio > 1.8) {
        latencyPenalty = 30;
      } else if (ratio > 1.2) {
        latencyPenalty = 20;
      } else {
        latencyPenalty = 12;
      }

      score -= latencyPenalty;
      if (!degradationReason || isStatusMatch) {
        degradationReason = `High latency: ${currentResponseTime}ms (exceeds ${latencyThresholdMs}ms threshold)`;
      }
    }

    // --- Factor 3: Recent Historical Error Rate ---
    if (recentLogs.length > 0) {
      const recentWindow = recentLogs.slice(0, 10);
      const errorsInWindow = recentWindow.filter(l => !this.isStatusAccepted(l.statusCode, expectedStatus, acceptedStatuses) || (l.failureType !== 'none' && l.failureType !== 'auth_failure')).length;
      if (errorsInWindow > 0) {
        const errorPenalty = Math.min(25, errorsInWindow * 4);
        score -= errorPenalty;
        if (!degradationReason && errorsInWindow >= 2) {
          degradationReason = `Recent stability issues (${errorsInWindow} errors in last ${recentWindow.length} checks)`;
        }
      }
    }

    // --- Factor 4: Consistent Recovery ---
    // If the latest check and the last 3 checks are all healthy and within latency, restore score towards 100
    if (!isServerError && !isNetworkFailure && isStatusMatch && currentResponseTime <= latencyThresholdMs) {
      const recentSuccessCount = recentLogs.slice(0, 5).filter(
        l => this.isStatusAccepted(l.statusCode, expectedStatus, acceptedStatuses) && l.responseTime <= latencyThresholdMs
      ).length;

      if (recentSuccessCount >= 4) {
        score = 100;
        degradationReason = `Optimal performance (HTTP ${currentStatusCode} in ${currentResponseTime}ms)`;
      } else if (recentSuccessCount >= 2) {
        score = Math.max(score, 92);
        degradationReason = `Optimal performance (HTTP ${currentStatusCode} in ${currentResponseTime}ms)`;
      }
    }

    // Clamp score to [0, 100]
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Determine classification based on score
    let status: EndpointStatus;
    if (score >= 90) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'degraded';
    } else {
      status = 'down';
    }

    return {
      healthScore: score,
      status,
      degradationReason,
      uptime,
      responseTimeP50: percentiles.p50,
      responseTimeP95: percentiles.p95,
      responseTimeP99: percentiles.p99,
    };
  },
};
