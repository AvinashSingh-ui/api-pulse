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
   * Safe URL construction:
   * Strips trailing slashes from baseUrl, ensures a leading slash on path,
   * prevents double slashes (e.g. https://httpbin.org/ + /get -> https://httpbin.org/get).
   */
  buildFullUrl(baseUrl: string, path: string): string {
    const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
    const cleanPath = (path || '').trim().replace(/^\/+/, '/');
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
   * Calculate uptime percentage from historical request logs.
   * Uptime is the ratio of successful checks (matching expected status) to total checks.
   */
  calculateUptime(logs: RequestLog[], expectedStatus = 200): number {
    if (!logs.length) return 100.0;
    const successful = logs.filter(l => l.statusCode === expectedStatus && l.statusCode < 400).length;
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
    latencyThresholdMs?: number;
    failureType?: RequestLog['failureType'];
    recentLogs?: RequestLog[];
    timeout?: number;
  }): HealthScoreResult {
    const {
      currentStatusCode,
      currentResponseTime,
      expectedStatus = 200,
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
    const uptime = this.calculateUptime(recentLogs, expectedStatus);

    let score = 100;
    let degradationReason: string | undefined;

    // --- Factor 1: Status Code & Availability Penalties ---
    const isServerError = currentStatusCode >= 500;
    const isNetworkFailure = failureType === 'connection_refused' || failureType === 'timeout' || failureType === 'network_error';
    const isStatusMismatch = currentStatusCode !== expectedStatus;

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
    } else if (isStatusMismatch || currentStatusCode >= 400) {
      // Moderate drop: Degraded status
      score -= 35;
      degradationReason = `Unexpected HTTP ${currentStatusCode} (Expected ${expectedStatus})`;
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
      if (!degradationReason) {
        degradationReason = `High latency: ${currentResponseTime}ms (exceeds ${latencyThresholdMs}ms threshold)`;
      }
    }

    // --- Factor 3: Recent Historical Error Rate ---
    if (recentLogs.length > 0) {
      const recentWindow = recentLogs.slice(0, 10);
      const errorsInWindow = recentWindow.filter(l => l.statusCode >= 400 || l.failureType !== 'none').length;
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
    if (!isServerError && !isNetworkFailure && !isStatusMismatch && currentResponseTime <= latencyThresholdMs) {
      const recentSuccessCount = recentLogs.slice(0, 5).filter(
        l => l.statusCode === expectedStatus && l.responseTime <= latencyThresholdMs
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
