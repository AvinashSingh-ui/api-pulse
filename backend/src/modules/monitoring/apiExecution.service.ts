import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Endpoint, RequestLog, Alert, AppNotification, HttpMethod } from '../../types/index.js';
import { healthService, HealthScoreResult } from './health.service.js';
import { notificationService } from '../notifications/notification.service.js';
import { aiService } from '../ai/ai.service.js';

export interface ExecutionResult {
  endpoint: Endpoint;
  statusCode: number;
  statusText?: string;
  responseTime: number;
  isSuccess: boolean;
  failureType: RequestLog['failureType'];
  errorMessage?: string;
  responseHeaders?: Record<string, string>;
  responseBodySnippet?: string;
  requestHeaders?: Record<string, string>;
  resolvedUrl: string;
  healthResult: HealthScoreResult;
  raisedAlert: Alert | null;
  triggeredNotification?: AppNotification | null;
}

/**
 * Generate a valid dummy test payload from an OpenAPI / JSON Schema definition.
 */
export function generatePayloadFromSchema(schema: any): any {
  if (!schema) return { status: 'active' };
  if (typeof schema === 'string') {
    try {
      const parsed = JSON.parse(schema);
      if (typeof parsed === 'object' && parsed !== null) return generatePayloadFromSchema(parsed);
    } catch {
      return { status: 'active' };
    }
  }
  if (typeof schema !== 'object') return { status: 'active' };

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  // Handle allOf, anyOf, oneOf
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    let merged = {};
    for (const sub of schema.allOf) {
      merged = { ...merged, ...generatePayloadFromSchema(sub) };
    }
    return merged;
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generatePayloadFromSchema(schema.anyOf[0]);
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generatePayloadFromSchema(schema.oneOf[0]);
  }

  const type = schema.type || (schema.properties ? 'object' : 'string');

  if (type === 'object') {
    const obj: Record<string, any> = {};
    const props = schema.properties || {};
    for (const [key, propDef] of Object.entries(props)) {
      obj[key] = generatePayloadFromSchema(propDef);
    }
    return obj;
  }

  if (type === 'array') {
    const itemSchema = schema.items || {};
    return [generatePayloadFromSchema(itemSchema)];
  }

  if (type === 'integer' || type === 'number') {
    if (schema.minimum !== undefined) return schema.minimum;
    if (schema.maximum !== undefined) return Math.min(100, schema.maximum);
    return 1;
  }

  if (type === 'boolean') {
    return true;
  }

  if (type === 'string') {
    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }
    const fmt = schema.format;
    if (fmt === 'date-time' || fmt === 'date') return new Date().toISOString();
    if (fmt === 'email') return 'monitor-test@apipulse.io';
    if (fmt === 'uuid') return '00000000-0000-0000-0000-000000000001';
    if (fmt === 'uri' || fmt === 'url') return 'https://apipulse.io';
    return 'test_value';
  }

  return {};
}

export const apiExecutionService = {
  generatePayloadFromSchema,

  /**
   * Core unified execution pipeline for any endpoint check (manual or automated).
   */
  async executeEndpointCheck(
    endpoint: Endpoint,
    callerIp = '127.0.0.1',
    userAgent = 'API-Pulse-Automated-Monitor/1.0',
    isManualTrigger = false,
    projectOverride?: any
  ): Promise<ExecutionResult> {
    const prevStatus = endpoint.status;
    let project = projectOverride || db.projects.find(p => p.id === endpoint.projectId);
    if (!project && endpoint.projectId === 'p_test') {
      project = { id: 'p_test', name: 'Test Project', baseUrl: 'https://httpbin.org', status: 'active' };
    }
    if (!project || project.status === 'deleted' || project.deletedAt) {
      throw new Error('Parent project is deleted or inactive');
    }

    // 1. Build & Resolve Target URL with Path Parameters
    const targetUrl = healthService.buildFullUrl(project.baseUrl, endpoint.path, endpoint.pathParams);
    let resolvedUrl = targetUrl;
    if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
      if (resolvedUrl.startsWith('localhost') || resolvedUrl.startsWith('127.0.0.1')) {
        resolvedUrl = `http://${resolvedUrl}`;
      } else if (resolvedUrl.includes('.')) {
        resolvedUrl = `https://${resolvedUrl}`;
      }
    }

    // 2. Prepare HTTP Method
    const methodUpper = (endpoint.method || 'GET').toUpperCase() as HttpMethod;
    const isBodyMethod = methodUpper === 'POST' || methodUpper === 'PUT' || methodUpper === 'PATCH';

    // 3. Prepare Custom & Auth Headers (Inherit Project-level headers & token if present)
    let projectHeaders: Record<string, string> = {};
    if (project.headers) {
      if (typeof project.headers === 'string') {
        try { projectHeaders = JSON.parse(project.headers); } catch {}
      } else if (typeof project.headers === 'object') {
        projectHeaders = { ...project.headers };
      }
    }
    if (project.bearerToken && !projectHeaders['Authorization']) {
      projectHeaders['Authorization'] = `Bearer ${String(project.bearerToken).replace(/^Bearer\s+/i, '').trim()}`;
    } else if (project.apiKey && !projectHeaders['x-api-key']) {
      projectHeaders[project.apiKeyHeader || 'x-api-key'] = String(project.apiKey).trim();
    }

    let customHeaders: Record<string, string> = {};
    if (endpoint.headers) {
      if (typeof endpoint.headers === 'string') {
        try { customHeaders = JSON.parse(endpoint.headers); } catch {}
      } else if (typeof endpoint.headers === 'object') {
        customHeaders = { ...endpoint.headers };
      }
    }

    // Merge: project headers as base, endpoint headers override
    const mergedHeaders = { ...projectHeaders, ...customHeaders };

    // Auto-inject required header for notification-service or microservices if not explicitly set
    if (!mergedHeaders['x-product-id'] && (resolvedUrl.includes('notification-service') || project.baseUrl?.includes('notification-service'))) {
      mergedHeaders['x-product-id'] = '00000000-0000-0000-0000-000000000001';
    }

    // Strip placeholder tokens like "Bearer <YOUR_TOKEN>" or "<API_KEY>" if present so they don't break remote servers
    for (const [hk, hv] of Object.entries(mergedHeaders)) {
      if (typeof hv === 'string' && (hv.includes('<YOUR_TOKEN>') || hv.includes('<API_KEY>') || hv.includes('<CREDENTIALS>'))) {
        delete mergedHeaders[hk];
      }
    }

    const contentType = endpoint.contentType || mergedHeaders['Content-Type'] || (isBodyMethod ? 'application/json' : undefined);

    const requestHeaders: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': userAgent,
      'X-Monitoring-Health-Check': 'true',
      ...mergedHeaders,
    };

    if (contentType) {
      requestHeaders['Content-Type'] = contentType;
    }

    // 4. Prepare Request Body / Payload
    let requestData: any = undefined;
    if (endpoint.body !== undefined && endpoint.body !== null && endpoint.body !== '') {
      if (typeof endpoint.body === 'string') {
        const trimmed = endpoint.body.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            requestData = JSON.parse(trimmed);
          } catch {
            requestData = isBodyMethod ? { status: 'active', message: trimmed } : trimmed;
          }
        } else {
          requestData = isBodyMethod ? { status: 'active', value: trimmed } : trimmed;
        }
      } else {
        requestData = endpoint.body;
      }
    } else if (isBodyMethod) {
      // If no explicit body is set, try to derive from stored schema
      if (endpoint.bodySchema) {
        requestData = generatePayloadFromSchema(endpoint.bodySchema);
      } else {
        // Safe, clean default test payload for monitoring POST/PUT/PATCH
        requestData = {
          name: 'health_check',
          status: 'active',
          timestamp: new Date().toISOString(),
        };
      }
    }

    // For DELETE, ensure empty string body is undefined so it doesn't violate HTTP/1.1 payload semantics
    if (methodUpper === 'DELETE' && (requestData === '' || requestData === undefined)) {
      requestData = undefined;
    }

    // 5. Execute HTTP Request with Axios
    const startTime = Date.now();
    let measuredRt = 0;
    let statusCode = 200;
    let statusText: string | undefined = 'OK';
    let isSuccess = true;
    let failureType: RequestLog['failureType'] = 'none';
    let errorMessage: string | undefined;
    let responseHeaders: Record<string, string> = {};
    let responseBodySnippet = '';
    let responseSize = 0;

    const timeout = Math.min(endpoint.timeout || 5000, 15000);

    try {
      if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
        measuredRt = Date.now() - startTime;
        isSuccess = false;
        statusCode = 400;
        failureType = 'network_error';
        errorMessage = `Invalid URL: Target URL "${targetUrl}" must use HTTP or HTTPS protocol`;
      } else {
        const axiosConfig: AxiosRequestConfig = {
          method: methodUpper.toLowerCase(),
          url: resolvedUrl,
          timeout,
          validateStatus: () => true, // capture all status codes without throwing
          headers: requestHeaders,
          params: endpoint.queryParams,
          transformResponse: [(data) => data], // keep raw to capture exact body and size
        };

        if (isBodyMethod || (methodUpper === 'DELETE' && requestData !== undefined)) {
          if (contentType?.includes('application/x-www-form-urlencoded') && typeof requestData === 'object') {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(requestData)) {
              params.append(k, String(v));
            }
            axiosConfig.data = params.toString();
          } else if (contentType?.includes('application/json') && typeof requestData === 'object') {
            axiosConfig.data = JSON.stringify(requestData);
          } else {
            axiosConfig.data = requestData;
          }
        }

        const response: AxiosResponse = await axios(axiosConfig);
        measuredRt = Date.now() - startTime;
        statusCode = response.status;
        statusText = response.statusText || String(statusCode);

        // Capture response headers
        if (response.headers && typeof response.headers === 'object') {
          for (const [hk, hv] of Object.entries(response.headers)) {
            if (typeof hv === 'string') responseHeaders[hk] = hv;
            else if (Array.isArray(hv)) responseHeaders[hk] = hv.join(', ');
          }
        }

        // Capture response body snippet
        const rawBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        responseSize = Buffer.byteLength(rawBody || '', 'utf-8');
        responseBodySnippet = (rawBody || '').slice(0, 500);

        // 6. Validate Response against Expected Status
        const expectedStatus = endpoint.expectedStatus || 200;
        isSuccess = healthService.isStatusAccepted(statusCode, expectedStatus, endpoint.expectedStatuses);

        if (!isSuccess) {
          if (statusCode === 401 || statusCode === 403) {
            failureType = 'auth_failure';
            errorMessage = `HTTP ${statusCode} (${statusCode === 401 ? 'Unauthorized' : 'Forbidden'}): Check authentication headers or API keys`;
          } else if (statusCode >= 500) {
            failureType = 'server_error';
            errorMessage = `HTTP ${statusCode} Server Error: ${statusText}`;
          } else if (statusCode >= 400) {
            failureType = 'client_error';
            errorMessage = `HTTP ${statusCode} Client Error: Expected ${expectedStatus}`;
          } else {
            failureType = 'unexpected_status';
            errorMessage = `HTTP ${statusCode} (Expected ${expectedStatus})`;
          }
        }
      }
    } catch (err: any) {
      measuredRt = Date.now() - startTime;
      isSuccess = false;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        failureType = 'timeout';
        statusCode = 504;
        statusText = 'Gateway Timeout';
        errorMessage = `Request timed out after ${timeout}ms`;
      } else if (err.code === 'ECONNREFUSED') {
        failureType = 'connection_refused';
        statusCode = 502;
        statusText = 'Bad Gateway';
        errorMessage = 'ECONNREFUSED: Server unreachable or connection refused';
      } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        failureType = 'network_error';
        statusCode = 503;
        statusText = 'Service Unavailable';
        errorMessage = `DNS resolution failed: Host not found for "${resolvedUrl}"`;
      } else {
        failureType = 'network_error';
        statusCode = 503;
        statusText = 'Service Unavailable';
        errorMessage = err.message || 'Target host unreachable';
      }
    }

    // 7. Write Request Log
    const newLog: RequestLog = {
      id: `log_${uuidv4().slice(0, 8)}`,
      endpointId: endpoint.id,
      projectId: endpoint.projectId,
      method: endpoint.method,
      path: endpoint.path,
      statusCode,
      responseTime: measuredRt,
      requestSize: Buffer.byteLength(JSON.stringify(requestData || {}), 'utf-8') + 200,
      responseSize: responseSize || 256,
      ip: callerIp,
      userAgent,
      timestamp: new Date().toISOString(),
      failureType,
      error: errorMessage,
      requestHeaders,
      responseHeaders,
      responseBodySnippet,
    };

    db.logs.unshift(newLog);
    if (db.logs.length > 500) db.logs.pop();

    // 8. Calculate Historical Health Metrics
    const recentLogs = db.logs.filter(l => l.endpointId === endpoint.id);
    const healthResult = healthService.calculateHealth({
      currentStatusCode: statusCode,
      currentResponseTime: measuredRt,
      expectedStatus: endpoint.expectedStatus || 200,
      acceptedStatuses: endpoint.expectedStatuses,
      latencyThresholdMs: endpoint.latencyThresholdMs || 500,
      failureType,
      recentLogs,
      timeout,
    });

    // 9. Update Endpoint State
    endpoint.lastChecked = new Date().toISOString();
    endpoint.lastStatusCode = statusCode;
    endpoint.status = healthResult.status;
    endpoint.healthScore = healthResult.healthScore;
    endpoint.degradationReason = healthResult.degradationReason;
    endpoint.responseTimeP50 = healthResult.responseTimeP50;
    endpoint.responseTimeP95 = healthResult.responseTimeP95;
    endpoint.responseTimeP99 = healthResult.responseTimeP99;
    endpoint.uptime = healthResult.uptime;

    // Persist to SQLite & Postgres if connected
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE endpoints SET status = ?, health_score = ?, degradation_reason = ?, last_status_code = ?, p50_ms = ?, p95_ms = ?, p99_ms = ?, uptime = ?, last_checked = ? WHERE id = ?',
          [endpoint.status, endpoint.healthScore ?? null, endpoint.degradationReason ?? null, endpoint.lastStatusCode ?? null, endpoint.responseTimeP50, endpoint.responseTimeP95, endpoint.responseTimeP99, endpoint.uptime, endpoint.lastChecked, endpoint.id]
        );
        sqliteService.execute(
          'INSERT INTO request_logs (id, endpoint_id, project_id, method, path, status_code, response_time_ms, request_size, response_size, ip_address, user_agent, failure_type, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newLog.id, newLog.endpointId, newLog.projectId, newLog.method, newLog.path, newLog.statusCode, newLog.responseTime, newLog.requestSize, newLog.responseSize, newLog.ip, newLog.userAgent, newLog.failureType, newLog.error || null, newLog.timestamp]
        );
      } catch (err: any) {
        console.warn('[ExecutionService] SQLite update error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'UPDATE endpoints SET status = $1, health_score = $2, degradation_reason = $3, last_status_code = $4, p50_ms = $5, p95_ms = $6, p99_ms = $7, uptime = $8, last_checked = $9 WHERE id = $10',
          [endpoint.status, endpoint.healthScore, endpoint.degradationReason, endpoint.lastStatusCode, endpoint.responseTimeP50, endpoint.responseTimeP95, endpoint.responseTimeP99, endpoint.uptime, endpoint.lastChecked, endpoint.id]
        );
      } catch (err: any) {
        console.warn('[ExecutionService] Postgres update error:', err.message);
      }
    }

    // 10. Intelligent Alerts Management
    let raisedAlert: Alert | null = null;
    if (endpoint.status === 'down' || endpoint.status === 'degraded') {
      const existingAlert = db.alerts.find(a => a.endpointId === endpoint.id && a.status === 'active');
      if (!existingAlert) {
        raisedAlert = {
          id: `alt_${uuidv4().slice(0, 8)}`,
          ruleId: 'system_auto_detector',
          projectId: endpoint.projectId,
          endpointId: endpoint.id,
          title: endpoint.status === 'down'
            ? `Critical Outage: ${endpoint.method} ${endpoint.path} is DOWN`
            : `Health Degraded on ${endpoint.method} ${endpoint.path}`,
          message: endpoint.degradationReason || errorMessage || `Health check failed: HTTP ${statusCode} in ${measuredRt}ms`,
          severity: endpoint.status === 'down' ? 'critical' : 'high',
          status: 'active',
          triggeredAt: new Date().toISOString(),
          value: statusCode,
          threshold: endpoint.expectedStatus || 200,
        };
        db.alerts.unshift(raisedAlert);
        if (db.alerts.length > 200) db.alerts.pop();

        // Trigger AI Root Cause Analysis in background
        aiService.analyzeEndpoint(endpoint.id).catch(() => null);
      }
    } else {
      // Auto-resolve previous active alerts when healthy
      const activeForEp = db.alerts.filter(a => a.endpointId === endpoint.id && a.status === 'active');
      for (const a of activeForEp) {
        a.status = 'resolved';
        a.resolvedAt = new Date().toISOString();
        if (sqliteService.isConnected) {
          try {
            sqliteService.execute('UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?', ['resolved', a.resolvedAt, a.id]);
          } catch {}
        }
      }
    }

    // 11. Update Parent Project Average Health Score
    const projectEndpoints = db.endpoints.filter(e => e.projectId === project.id);
    if (projectEndpoints.length > 0) {
      const totalHealth = projectEndpoints.reduce((sum, e) => sum + (e.healthScore ?? 100), 0);
      project.healthScore = Math.round(totalHealth / projectEndpoints.length);
      if (sqliteService.isConnected) {
        try {
          sqliteService.execute('UPDATE projects SET health_score = ? WHERE id = ?', [project.healthScore, project.id]);
        } catch {}
      }
    }

    // 12. Trigger Health Notifications
    const triggeredNotification = notificationService.handleHealthTransition({
      endpoint,
      prevStatus,
      newStatus: endpoint.status,
      statusCode,
      responseTime: measuredRt,
      healthScore: endpoint.healthScore,
      degradationReason: endpoint.degradationReason,
      failureType,
      forceNotify: isManualTrigger,
    });

    db.save();

    return {
      endpoint,
      statusCode,
      statusText,
      responseTime: measuredRt,
      isSuccess,
      failureType,
      errorMessage,
      responseHeaders,
      responseBodySnippet,
      requestHeaders,
      resolvedUrl,
      healthResult,
      raisedAlert,
      triggeredNotification,
    };
  },
};
