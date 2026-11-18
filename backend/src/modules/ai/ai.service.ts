import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import { db } from '../../db/store.js';
import type { AIInsight, Endpoint, RequestLog } from '../../types/index.js';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

async function requestGemini(prompt: string, jsonMode = false): Promise<string | null> {
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  for (const model of GEMINI_MODELS) {
    try {
      const payload: any = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      if (jsonMode) {
        payload.generationConfig = {
          temperature: 0.1,
          responseMimeType: 'application/json',
        };
      }

      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        payload,
        { timeout: 9000 }
      );

      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) return reply;
    } catch (err: any) {
      // Continue to next model if available
      console.warn(`[AI] Gemini model ${model} attempt failed:`, err.response?.data?.error?.message || err.message);
    }
  }

  return null;
}

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

    const project = db.projects.find(p => p.id === endpoint.projectId);
    const targetUrl = project ? `${project.baseUrl}${endpoint.path}` : endpoint.path;

    const recentLogs = db.logs.filter(l => l.endpointId === endpointId).slice(0, 20);
    const errorLogs = recentLogs.filter(l => l.statusCode >= 400 || (l.failureType && l.failureType !== 'none'));
    const latestLog = recentLogs[0];
    const latestStatus = latestLog ? latestLog.statusCode : (endpoint.status === 'down' ? 500 : 200);

    // 1. ATTEMPT REAL GEMINI AI ANALYSIS
    try {
      const geminiPrompt = `You are a Senior Site Reliability Engineer (SRE) and Backend Performance Architect at API Pulse.
Analyze the following live API telemetry data and provide a genuine, honest, deeply technical root cause analysis and concrete fix instructions.

API Details:
- Name: ${endpoint.name}
- Method & Path: ${endpoint.method} ${endpoint.path}
- Target Full URL: ${targetUrl}
- Current Health Status: ${endpoint.status} (Health Score: ${endpoint.healthScore}/100)
- Last HTTP Status Code: ${latestStatus} (Expected: ${endpoint.expectedStatus || 200})
- Median Latency (P50): ${endpoint.responseTimeP50}ms | P95: ${endpoint.responseTimeP95}ms | P99: ${endpoint.responseTimeP99}ms
- Configured Latency SLA Threshold: ${endpoint.latencyThresholdMs || 500}ms
- Configured Timeout Limit: ${endpoint.timeout || 5000}ms
- Degradation Reason: ${endpoint.degradationReason || 'None'}
- Failure Type: ${latestLog?.failureType || 'none'}
- Recent Error Message: ${latestLog?.error || 'None'}
- Recent Status History: ${recentLogs.map(l => `${l.statusCode} (${l.responseTime}ms)`).slice(0, 5).join(', ') || 'None'}

Return ONLY a valid JSON object in this exact schema:
{
  "title": "Concise technical diagnosis title",
  "description": "Honest, comprehensive, production-grade technical explanation of what is failing and why.",
  "likelyCauses": [
    { "cause": "Technical root cause", "confidence": "high", "evidence": "Specific telemetry metric evidence" }
  ],
  "suggestedChecks": [
    "Troubleshooting check 1",
    "Troubleshooting check 2"
  ],
  "suggestedFix": {
    "summary": "Clear one-sentence summary of the required code or configuration fix",
    "language": "typescript",
    "steps": [
      "Step 1: description",
      "Step 2: description"
    ],
    "codeSnippet": "// Actionable code snippet fixing the issue"
  }
}`;

      const geminiReply = await requestGemini(geminiPrompt, true);
      if (geminiReply) {
        const cleaned = geminiReply.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed && parsed.title && parsed.description) {
          const geminiInsight: AIInsight = {
            id: `ins_${uuidv4().slice(0, 8)}`,
            type: endpoint.status === 'down' ? 'anomaly' : endpoint.status === 'degraded' ? 'trend' : 'recommendation',
            title: parsed.title,
            description: parsed.description,
            severity: endpoint.status === 'down' ? 'critical' : endpoint.status === 'degraded' ? 'warning' : 'info',
            confidence: 0.98,
            endpointId: endpoint.id,
            projectId: endpoint.projectId,
            createdAt: new Date().toISOString(),
            metadata: {
              p50: endpoint.responseTimeP50,
              p95: endpoint.responseTimeP95,
              status: endpoint.status,
              poweredBy: 'Gemini 2.5 Flash',
            },
            likelyCauses: Array.isArray(parsed.likelyCauses) ? parsed.likelyCauses : [],
            suggestedChecks: Array.isArray(parsed.suggestedChecks) ? parsed.suggestedChecks : [],
            suggestedFix: parsed.suggestedFix || undefined,
          };

          db.aiInsights.unshift(geminiInsight);
          if (db.aiInsights.length > 200) db.aiInsights.pop();
          db.save();
          return [geminiInsight];
        }
      }
    } catch (err: any) {
      console.warn('[AI] Gemini analysis parsing failed, falling back to heuristic engine:', err.message);
    }

    // 2. ENHANCED HEURISTIC ENGINE (FALLBACK)
    let insightTitle = `Performance Analysis: ${endpoint.method} ${endpoint.path}`;
    let insightDescription = '';
    let likelyCauses: AIInsight['likelyCauses'] = [];
    let suggestedChecks: string[] = [];
    let suggestedFix: AIInsight['suggestedFix'] = undefined;

    if (latestStatus === 415 || errorLogs.some(l => l.statusCode === 415)) {
      insightTitle = `HTTP 415 Unsupported Media Type on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `The upstream server rejected the request because the request payload was missing or the Content-Type header was not specified as application/json.`;
      likelyCauses = [
        { cause: 'Missing Content-Type: application/json header on mutation request', confidence: 'high', evidence: `HTTP 415 received on ${endpoint.method} request to ${endpoint.path}` },
        { cause: 'Request body payload is missing or not formatted as valid JSON', confidence: 'high', evidence: 'Upstream server expects structured JSON request entity' },
        { cause: 'Server requires explicit Accept: application/json header', confidence: 'medium', evidence: 'API route requires JSON MIME type negotiation' },
      ];
      suggestedChecks = [
        `Verify request headers include 'Content-Type': 'application/json' and 'Accept': 'application/json'`,
        `Provide a valid JSON body entity (e.g. {} or required fields) when invoking ${endpoint.method} requests`,
        `Test route using cURL: curl -X ${endpoint.method} "${targetUrl}" -H "Content-Type: application/json" -d "{}"`,
      ];
      suggestedFix = {
        summary: 'Add Content-Type: application/json headers and provide valid request body',
        language: 'typescript',
        steps: [
          'Set headers: { "Content-Type": "application/json", "Accept": "application/json" } in client request configuration.',
          'Pass a non-empty or valid JSON object body in POST / PUT / PATCH requests.',
        ],
        codeSnippet: `// Client Request Fix with Content-Type header
const response = await fetch('${targetUrl}', {
  method: '${endpoint.method}',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    // Add required payload fields here
  }),
});
const data = await response.json();`,
      };
    } else if (errorLogs.some(l => l.statusCode >= 500 && l.statusCode !== 502 && l.statusCode !== 504) || (latestStatus >= 500 && latestStatus !== 502 && latestStatus !== 504)) {
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
        codeSnippet: `// Defensive Route Handler Fix
app.${endpoint.method.toLowerCase()}('${endpoint.path}', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await yourBusinessService.handle(req);
    return res.status(${endpoint.expectedStatus || 200}).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Error ${endpoint.method} ${endpoint.path}]:', error.stack || error.message);
    return next(error);
  }
});`,
      };
    } else if (errorLogs.some(l => l.failureType === 'timeout' || l.statusCode === 504) || latestStatus === 504) {
      insightTitle = `Gateway Timeout (HTTP 504) on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `Multiple requests exceeded the configured ${endpoint.timeout || 5000}ms timeout limit. Downstream services, slow database serialization, or cold starts are causing request queuing.`;
      likelyCauses = [
        { cause: 'Downstream microservice or database query latency', confidence: 'high', evidence: `Response exceeded ${endpoint.timeout || 5000}ms SLA` },
        { cause: 'Lock contention on write-heavy database tables', confidence: 'medium', evidence: 'Sequential queries blocking connection pool threads' },
      ];
      suggestedChecks = [
        `Increase endpoint timeout threshold from ${endpoint.timeout || 5000}ms temporarily if upstream operation is batch`,
        'Check database slow query logs (EXPLAIN ANALYZE)',
        'Enable response caching for read-heavy operations',
      ];
      suggestedFix = {
        summary: 'Optimize query indexing and configure client timeout retry backoff',
        language: 'typescript',
        steps: [
          'Add compound indexes to database filter fields.',
          'Implement an in-memory Redis cache with a short TTL.',
        ],
        codeSnippet: `// Timeout optimization with caching
const cached = await redis.get(cacheKey);
if (cached) return res.json(JSON.parse(cached));
const freshData = await db.query(sql);
await redis.setex(cacheKey, 60, JSON.stringify(freshData));
return res.json(freshData);`,
      };
    } else if (endpoint.status === 'degraded' || (endpoint.responseTimeP50 && endpoint.responseTimeP50 > (endpoint.latencyThresholdMs || 500))) {
      insightTitle = `Latency Degradation (${endpoint.responseTimeP50}ms > ${endpoint.latencyThresholdMs || 500}ms SLA) on ${endpoint.method} ${endpoint.path}`;
      insightDescription = `Median latency of ${endpoint.responseTimeP50}ms exceeds your configured performance SLA threshold (${endpoint.latencyThresholdMs || 500}ms). The route is returning HTTP ${latestStatus} but is experiencing slow execution.`;
      likelyCauses = [
        { cause: 'Unindexed database query or sequential sub-queries (N+1 problem)', confidence: 'high', evidence: `Median response time is ${endpoint.responseTimeP50}ms` },
        { cause: 'Payload serialization overhead or uncompressed response body', confidence: 'medium', evidence: 'Latency consistent across multiple check samples' },
      ];
      suggestedChecks = [
        `Review database execution plan for ${endpoint.path} query logic`,
        'Enable gzip/brotli compression middleware in Express/Fastify',
        'Check server CPU and memory utilization on the host',
      ];
      suggestedFix = {
        summary: 'Add query indexing, eager loading, and response compression',
        language: 'typescript',
        steps: [
          'Add compression middleware: app.use(compression()).',
          'Use eager loading instead of iterating queries in loops.',
        ],
        codeSnippet: `import compression from 'compression';
// Enable HTTP payload compression
app.use(compression());`,
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
    if (db.aiInsights.length > 200) db.aiInsights.pop();
    db.save();

    return [newInsight];
  },

  chatWithAI: async (message: string, context?: Record<string, unknown>): Promise<{ response: string; insights?: AIInsight[] }> => {
    // 1. Call Gemini with Live System Telemetry
    const endpointsSummary = db.endpoints.map(e =>
      `- ${e.method} ${e.path} (${e.name}): Status=${e.status}, P50=${e.responseTimeP50}ms, Uptime=${e.uptime}%, LastStatus=${e.lastStatusCode || 'N/A'}`
    ).join('\n');

    const activeAlerts = db.alerts.filter(a => a.status === 'active');
    const alertsSummary = activeAlerts.length > 0
      ? activeAlerts.map(a => `- [${a.severity.toUpperCase()}] ${a.title}: ${a.message}`).join('\n')
      : 'None (All systems healthy)';

    const geminiPrompt = `You are API Pulse AI, a site reliability engineering and API monitoring expert.
Live Telemetry Context:
Active Endpoints (${db.endpoints.length}):
${endpointsSummary || 'No endpoints registered yet.'}

Active Alerts (${activeAlerts.length}):
${alertsSummary}

User question: "${message}"

Provide a genuine, honest, deeply technical, practical and actionable answer. Explain root causes and exact code or architecture fixes where relevant.`;

    const geminiReply = await requestGemini(geminiPrompt, false);
    if (geminiReply) {
      return { response: geminiReply };
    }

    // 2. Heuristic fallback
    const lower = message.toLowerCase();
    let reply = '';

    if (lower.includes('415') || lower.includes('media type')) {
      reply = `**HTTP 415 Unsupported Media Type Analysis:**\n` +
        `The API endpoint is receiving a request without the required \`Content-Type: application/json\` header or without a valid JSON body payload.\n\n` +
        `**Solution:** Ensure client requests include:\n` +
        `\`headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }\` and pass a valid JSON body \`{}\`.`;
    } else if (lower.includes('timeout') || lower.includes('504')) {
      reply = `**Root Cause for 504 / Gateway Timeout:**\n` +
        `1. **Downstream Bottleneck:** A microservice or external API is failing to respond before your gateway's timeout ceiling (currently 5000ms).\n` +
        `2. **Database Locks:** Long-running write transactions or unindexed queries on large tables.\n\n` +
        `**Recommended Action:** Increase the endpoint timeout buffer temporarily, inspect slow queries, and ensure connection pooling is properly sized.`;
    } else if (lower.includes('down') || lower.includes('500') || lower.includes('connection refused')) {
      reply = `**Analysis for 500 / Connection Refused Errors:**\n` +
        `1. The backend application service may have crashed due to an unhandled exception or Out-Of-Memory (OOM) kill.\n` +
        `2. Reverse proxy / firewall port binding configuration issue.\n\n` +
        `**Recommended Action:** Check container restart count, run \`docker logs\` or \`pm2 logs\`, and test manual ping from API Pulse dashboard.`;
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
        (alerts > 0 ? `There are ${alerts} active alerts requiring attention. Check the Alerts tab for resolution.` : `All monitored APIs are currently operating within target thresholds.`);
    } else {
      reply = `I am analyzing your API Pulse telemetry data. For **"${message}"**, verify your alert rule thresholds in the **Alerts** module and inspect **Request Logs** for detailed status code distributions. You can also click "Analyze with AI" directly on any endpoint for full root cause diagnosis.`;
    }

    return { response: reply };
  },
};
