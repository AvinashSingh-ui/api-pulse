import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import { db } from '../../db/store.js';
import type { AIInsight, Endpoint, RequestLog } from '../../types/index.js';

export const aiService = {
  getInsights: (params?: { projectId?: string; endpointId?: string; type?: string }): AIInsight[] => {
    let items = db.aiInsights;
    if (params?.projectId) {
      items = items.filter(i => i.projectId === params.projectId);
    }
    if (params?.endpointId) {
      items = items.filter(i => i.endpointId === params.endpointId);
    }
    if (params?.type) {
      items = items.filter(i => i.type === params.type);
    }
    return items;
  },

  analyzeEndpoint: async (endpointId: string): Promise<AIInsight[]> => {
    const endpoint = db.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return [];

    const recentLogs = db.logs.filter(l => l.endpointId === endpointId).slice(0, 20);
    const errorLogs = recentLogs.filter(l => l.statusCode >= 400 || (l.failureType && l.failureType !== 'none'));
    const latestLog = recentLogs[0];
    const latestStatus = latestLog ? latestLog.statusCode : (endpoint.status === 'down' ? 500 : 200);

    let insightTitle = `Performance Analysis: ${endpoint.method} ${endpoint.path}`;
    let insightDescription = '';
    let likelyCauses: AIInsight['likelyCauses'] = [];
    let suggestedChecks: string[] = [];
    let suggestedFix: AIInsight['suggestedFix'] = undefined;

    if (errorLogs.some(l => l.statusCode >= 500 && l.statusCode !== 502 && l.statusCode !== 504) || (latestStatus >= 500 && latestStatus !== 502 && latestStatus !== 504)) {
      insightTitle = `Server Runtime Exception (HTTP ${latestStatus}) on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `The upstream server threw an unhandled internal exception or crashed during request execution. The response code ${latestStatus} indicates an application-level defect or uncaught promise rejection.`;
      likelyCauses = [
        { cause: 'Unhandled Exception / Null Reference in controller logic', confidence: 'high', evidence: `HTTP ${latestStatus} returned on ${endpoint.method} ${endpoint.path}` },
        { cause: 'Database query execution failure or connection pool exhaustion', confidence: 'high', evidence: 'Internal service response terminated before sending standard payload' },
        { cause: 'Missing environment variables or unhandled asynchronous promise rejection', confidence: 'medium', evidence: 'Upstream process encountered fatal branch' },
      ];
      suggestedChecks = [
        'Inspect server stdout/stderr logs and stack trace at the failure timestamp',
        'Check database connection health and active pool capacity',
        'Verify required environment variables and secrets are configured',
      ];
      suggestedFix = {
        summary: 'Add defensive try/catch error handling, input validation, and global error middleware',
        language: 'typescript',
        steps: [
          'Wrap the route handler in a structured try/catch block to prevent unhandled process crashes.',
          'Log full stack traces server-side and return standardized JSON error responses with appropriate HTTP status codes.',
          'Implement an Express global error-handling boundary as the final app middleware.',
        ],
        codeSnippet: `// 1. Defensive Route Handler Fix
app.${endpoint.method.toLowerCase()}('${endpoint.path}', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request parameters / body
    if (!req.query && !req.body) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Missing required parameters' });
    }

    const result = await yourBusinessService.handle(req);
    return res.status(${endpoint.expectedStatus || 200}).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Error ${endpoint.method} ${endpoint.path}]:', error.stack || error.message);
    // Forward to centralized error handler without crashing server
    return next(error);
  }
});

// 2. Centralized Global Error Middleware (app.ts)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'An internal error occurred' : err.message,
  });
});`,
      };
    } else if (errorLogs.some(l => l.failureType === 'timeout' || l.statusCode === 504) || latestStatus === 504) {
      insightTitle = `Gateway Timeout (HTTP 504) on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `Multiple requests exceeded the configured ${endpoint.timeout || 3000}ms timeout limit. Downstream services, slow database serialization, or cold starts are causing request queuing.`;
      likelyCauses = [
        { cause: 'Downstream microservice or database query latency', confidence: 'high', evidence: `Response exceeded ${endpoint.timeout || 3000}ms SLA` },
        { cause: 'Lock contention on write-heavy database tables', confidence: 'medium', evidence: 'Sequential queries blocking connection pool threads' },
        { cause: 'Missing index on foreign key or filter fields', confidence: 'medium', evidence: 'Execution time scaling linearly with dataset size' },
      ];
      suggestedChecks = [
        `Increase endpoint timeout threshold from ${endpoint.timeout || 3000}ms to ${Math.round((endpoint.timeout || 3000) * 1.5)}ms temporarily`,
        'Check database slow query logs (pg_stat_activity / EXPLAIN ANALYZE)',
        'Enable response caching for read-heavy operations',
      ];
      suggestedFix = {
        summary: 'Optimize query indexing, configure client timeout retry backoff, and add caching',
        language: 'typescript',
        steps: [
          'Add a query timeout to backend database queries so requests fail quickly rather than hanging.',
          'Implement Redis or in-memory LRU caching for frequent read lookups.',
          'Configure exponential backoff and circuit breaking on the client caller.',
        ],
        codeSnippet: `// Client Retry & Circuit Breaker with Exponential Backoff
import axios from 'axios';
import axiosRetry from 'axios-retry';

const apiClient = axios.create({
  baseURL: '${endpoint.path}',
  timeout: ${Math.round((endpoint.timeout || 3000) * 1.5)}, // Increased timeout buffer
});

// Automatically retry 504 timeout errors with backoff
axiosRetry(apiClient, {
  retries: 3,
  retryDelay: (retryCount) => Math.pow(2, retryCount) * 1000, // 2s, 4s, 8s
  retryCondition: (error) => error.code === 'ECONNABORTED' || error.response?.status === 504,
});`,
      };
    } else if (errorLogs.some(l => l.failureType === 'connection_refused' || l.statusCode === 502) || latestStatus === 502) {
      insightTitle = `Connection Refused / Bad Gateway (502) on ${endpoint.path}`;
      insightDescription = `Target server is not accepting incoming TCP connections. The backend process or reverse proxy (Nginx/Traefik) may have crashed, restarted, or is listening on a different port.`;
      likelyCauses = [
        { cause: 'Target process terminated due to crash or Out-Of-Memory (OOM)', confidence: 'high', evidence: 'TCP connection handshake refused by host' },
        { cause: 'Reverse proxy upstream port mismatch or host firewall', confidence: 'medium', evidence: 'Gateway returned 502 Bad Gateway' },
      ];
      suggestedChecks = [
        'Check container status: docker ps or pm2 status',
        'Verify host port binding and local firewall rules',
        'Inspect kernel dmesg logs for OOM killer invocations',
      ];
      suggestedFix = {
        summary: 'Restart backend service with auto-restart supervisor (PM2 or Docker restart policy)',
        language: 'bash',
        steps: [
          'Verify if the backend process is running on the expected port.',
          'Configure a process supervisor to automatically restart on unhandled crashes.',
        ],
        codeSnippet: `# 1. Check if backend port is actively listening:
netstat -ano | findstr :8000

# 2. Restart with PM2 process supervisor (auto-recovery):
pm2 start dist/index.js --name "api-backend" --max-memory-restart 512M --restart-delay 3000

# 3. In Docker Compose, ensure auto-restart policy:
restart: unless-stopped`,
      };
    } else if (errorLogs.some(l => l.statusCode === 404) || latestStatus === 404) {
      insightTitle = `Route Not Found (HTTP 404) on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `The target URL does not map to an active route handler on the server. The URL path, version prefix, or resource identifier is invalid.`;
      likelyCauses = [
        { cause: 'Route path typo or missing API version prefix (e.g. missing /api/v1)', confidence: 'high', evidence: 'Server returned HTTP 404 Not Found' },
        { cause: 'Resource record deleted or does not exist in database', confidence: 'medium', evidence: 'Target ID not located by database query' },
      ];
      suggestedChecks = [
        'Verify backend router has matching app.METHOD(path) definition',
        'Check URL prefix (/api/v1 vs /v1 vs root /)',
      ];
      suggestedFix = {
        summary: 'Verify router registration and validate resource IDs before querying',
        language: 'typescript',
        steps: [
          'Confirm route path definition matches exactly in Express router.',
          'Verify base URL configured in API Pulse project settings.',
        ],
        codeSnippet: `// Ensure route is mounted on Express router:
import express from 'express';
const router = express.Router();

router.${endpoint.method.toLowerCase()}('${endpoint.path}', (req, res) => {
  res.json({ message: 'Route active and healthy' });
});

export default router;`,
      };
    } else if (errorLogs.some(l => l.statusCode === 401 || l.statusCode === 403) || latestStatus === 401 || latestStatus === 403) {
      insightTitle = `Authentication / Permission Denied (HTTP ${latestStatus}) on ${endpoint.path}`;
      insightDescription = `Request was rejected by security authorization middleware. Missing, invalid, or expired credentials were provided.`;
      likelyCauses = [
        { cause: 'Missing Authorization header or expired JWT Bearer token', confidence: 'high', evidence: `HTTP ${latestStatus} returned by auth gate` },
        { cause: 'Invalid API key or IP whitelist restriction', confidence: 'medium', evidence: 'Token failed verification check' },
      ];
      suggestedChecks = [
        'Verify Authorization header is included in API Pulse endpoint configuration',
        'Ensure JWT signature secret matches in verification middleware',
      ];
      suggestedFix = {
        summary: 'Configure Bearer token or API key headers in endpoint settings',
        language: 'json',
        steps: [
          'Add valid authorization headers to your API Pulse endpoint configuration.',
          'Ensure token has not expired and holds required role permissions.',
        ],
        codeSnippet: `// Add to Endpoint Headers in API Pulse:
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "x-api-key": "your-api-pulse-production-key",
  "Content-Type": "application/json"
}`,
      };
    } else if (endpoint.status === 'degraded' || endpoint.responseTimeP95 > 500) {
      insightTitle = `High Latency Anomaly Detected on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `P95 latency is currently ${endpoint.responseTimeP95}ms, which is significantly higher than the baseline P50 of ${endpoint.responseTimeP50}ms.`;
      likelyCauses = [
        { cause: 'Uncached repeated database queries', confidence: 'high', evidence: 'Linear latency growth under concurrent load' },
        { cause: 'External downstream API throttling', confidence: 'medium', evidence: 'Spike observed during peak query intervals' },
      ];
      suggestedChecks = [
        'Add in-memory caching (e.g. Redis) for frequently accessed resource lookups',
        'Profile SQL queries and add missing indexes on filtered columns',
      ];
      suggestedFix = {
        summary: 'Implement Redis caching to reduce database read latency from 500ms+ to < 15ms',
        language: 'typescript',
        steps: [
          'Cache query results with a 60-second TTL in Redis.',
          'Bypass database fetch on cache hits to immediately return response.',
        ],
        codeSnippet: `// Redis Cache Wrapper
const cacheKey = \`cache:${endpoint.path}:\${req.originalUrl}\`;
const cached = await redis.get(cacheKey);
if (cached) {
  return res.json(JSON.parse(cached));
}

const freshData = await fetchFromDatabase();
await redis.set(cacheKey, JSON.stringify(freshData), 'EX', 60); // 60s cache
return res.json(freshData);`,
      };
    } else {
      insightTitle = `All Systems Optimal for ${endpoint.name}`;
      insightDescription = `Endpoint is performing within normal operational thresholds. Uptime is at ${endpoint.uptime}% with no active anomalies.`;
      likelyCauses = [
        { cause: 'Normal traffic load within provisioned capacity', confidence: 'high', evidence: 'Zero failed assertions across recent check history' },
      ];
      suggestedChecks = [
        'Maintain existing monitoring interval',
        'Consider setting up proactive latency alert rules for early warning',
      ];
    }

    const newInsight: AIInsight = {
      id: `ins_${uuidv4().slice(0, 8)}`,
      type: endpoint.status === 'down' ? 'anomaly' : endpoint.status === 'degraded' ? 'trend' : 'recommendation',
      title: insightTitle,
      description: insightDescription,
      severity: endpoint.status === 'down' ? 'critical' : endpoint.status === 'degraded' ? 'warning' : 'info',
      confidence: 0.94,
      endpointId: endpoint.id,
      projectId: endpoint.projectId,
      createdAt: new Date().toISOString(),
      metadata: { p50: endpoint.responseTimeP50, p95: endpoint.responseTimeP95, status: endpoint.status },
      likelyCauses,
      suggestedChecks,
      suggestedFix,
    };

    db.aiInsights.unshift(newInsight);
    db.save();

    return [newInsight];
  },

  chatWithAI: async (message: string, context?: Record<string, unknown>): Promise<{ response: string; insights?: AIInsight[] }> => {
    // If Gemini API Key is provided, call Gemini Live
    if (config.geminiApiKey) {
      try {
        const geminiRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.geminiApiKey}`,
          {
            contents: [{
              parts: [{
                text: `You are API Pulse AI, an intelligent API monitoring and root-cause analysis assistant for developers.
Context: ${JSON.stringify(context || {})}
Active Endpoints: ${db.endpoints.length}, Active Alerts: ${db.alerts.filter(a => a.status === 'active').length}.
User question: ${message}
Provide a concise, practical, technical answer with root causes and fixes.`
              }]
            }]
          },
          { timeout: 8000 }
        );
        const reply = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) return { response: reply };
      } catch (err) {
        console.warn('[AI] Gemini API failed, falling back to heuristic engine:', err);
      }
    }

    // Heuristic intelligent assistant
    const lower = message.toLowerCase();
    let reply = '';

    if (lower.includes('timeout') || lower.includes('504')) {
      reply = `**Root Cause for 504 / Gateway Timeout:**\n` +
        `1. **Downstream Bottleneck:** A microservice or external API is failing to respond before your gateway's timeout ceiling (currently 5000ms).\n` +
        `2. **Database Locks:** Long-running write transactions or unindexed queries on large tables.\n\n` +
        `**Recommended Action:** Increase the endpoint timeout buffer temporarily, inspect slow queries, and ensure connection pooling is properly sized.`;
    } else if (lower.includes('down') || lower.includes('500') || lower.includes('connection refused')) {
      reply = `**Analysis for 500 / Connection Refused Errors:**\n` +
        `1. The backend application service may have crashed due to an unhandled exception or Out-Of-Memory (OOM) kill.\n` +
        `2. Reverse proxy / firewall port binding configuration issue.\n\n` +
        `**Recommended Action:** Check container restart count, run \`docker logs\` or \`pm2 logs\`, and test manual ping from API Pulse dashboard.`;
    } else if (lower.includes('rate limit') || lower.includes('429')) {
      reply = `**HTTP 429 Too Many Requests Diagnosis:**\n` +
        `The endpoint has exceeded its configured rate limit quota (e.g. 60 requests/min).\n\n` +
        `**Recommended Action:** Check client IP rotation, enable Redis token-bucket rate limiter with higher burst limits, or cache frequent GET requests.`;
    } else if (lower.includes('status') || lower.includes('summary') || lower.includes('how is my api')) {
      const healthy = db.endpoints.filter(e => e.status === 'healthy').length;
      const degraded = db.endpoints.filter(e => e.status === 'degraded').length;
      const down = db.endpoints.filter(e => e.status === 'down').length;
      const alerts = db.alerts.filter(a => a.status === 'active').length;

      reply = `**API Pulse System Health Summary:**\n` +
        `- **Total Endpoints:** ${db.endpoints.length}\n` +
        `- **Healthy:** ${healthy} (${Math.round((healthy / (db.endpoints.length || 1)) * 100)}%)\n` +
        `- **Degraded:** ${degraded}\n` +
        `- **Down:** ${down}\n` +
        `- **Active Alerts:** ${alerts}\n\n` +
        (alerts > 0 ? `⚠️ There are ${alerts} active alerts requiring attention. Check the Alerts tab for resolution.` : `✅ All monitored APIs are currently operating within target thresholds!`);
    } else {
      reply = `I am analyzing your API Pulse telemetry data. For **"${message}"**, I recommend checking the **Request Logs** tab to inspect status code distributions and verify your alert rule thresholds in the **Alerts** module. If you need root cause analysis on a specific endpoint, click "Analyze with AI" directly on that route.`;
    }

    return { response: reply };
  },
};

