import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Endpoint, RequestLog, HttpMethod, Alert } from '../../types/index.js';
import { aiService } from '../ai/ai.service.js';
import { healthService } from '../monitoring/health.service.js';

// In-flight check tracker to prevent duplicate concurrent checks for the same endpoint
const activeChecks = new Set<string>();

export const endpointsController = {
  list: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '50', 10);
    const search = (req.query.search as string || '').toLowerCase().trim();
    const projectId = req.query.projectId as string;
    const method = req.query.method as string;
    const status = (req.query.status as string || '').toLowerCase();

    // Filter out endpoints belonging to deleted or archived projects
    const activeProjectIds = new Set(
      db.projects
        .filter(p => p.status === 'active' && !p.deletedAt)
        .map(p => p.id)
    );

    let items = db.endpoints.filter(e => activeProjectIds.has(e.projectId));

    if (projectId && projectId !== 'all') {
      items = items.filter(e => e.projectId === projectId);
    }

    if (search) {
      items = items.filter(e =>
        e.name.toLowerCase().includes(search) ||
        e.path.toLowerCase().includes(search)
      );
    }

    if (method && method !== 'all') {
      items = items.filter(e => e.method === method.toUpperCase());
    }

    if (status && status !== 'all') {
      if (status === 'unhealthy' || status === 'down') {
        items = items.filter(e => e.status === 'down' || (e.healthScore !== undefined && e.healthScore < 50));
      } else if (status === 'degraded') {
        items = items.filter(e => e.status === 'degraded' || (e.healthScore !== undefined && e.healthScore >= 50 && e.healthScore < 90));
      } else if (status === 'healthy') {
        items = items.filter(e => e.status === 'healthy' || (e.healthScore !== undefined && e.healthScore >= 90));
      } else {
        items = items.filter(e => e.status === status);
      }
    }

    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    return res.json({
      data: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  },

  getById: (req: Request, res: Response) => {
    const { id } = req.params;
    const endpoint = db.endpoints.find(e => e.id === id);
    if (!endpoint) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }
    const project = db.projects.find(p => p.id === endpoint.projectId);
    const fullUrl = project ? healthService.buildFullUrl(project.baseUrl, endpoint.path) : endpoint.path;

    return res.json({
      ...endpoint,
      fullUrl,
    });
  },

  create: async (req: Request, res: Response) => {
    const {
      projectId,
      name,
      path,
      method = 'GET',
      interval = 60,
      expectedStatus = 200,
      timeout = 5000,
      latencyThresholdMs = 500,
      headers = {},
      body,
      tags = [],
    } = req.body;

    if (!projectId || !name || !path) {
      return res.status(400).json({ message: 'projectId, name, and path are required' });
    }

    const project = db.projects.find(p => p.id === projectId);
    if (!project || project.status === 'deleted' || project.deletedAt) {
      return res.status(400).json({ message: 'Target project is invalid or has been deleted' });
    }

    // 1. URL Path Normalization and Validation
    const cleanPath = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;
    const urlValidation = healthService.validateEndpointUrl(project.baseUrl, cleanPath);
    if (!urlValidation.isValid) {
      return res.status(400).json({ message: urlValidation.error || 'Invalid endpoint URL path' });
    }

    // 2. Prevent Duplicate Endpoints in the same project
    const normalizedMethod = (method.toUpperCase() as HttpMethod) || 'GET';
    const isDuplicate = db.endpoints.some(
      e => e.projectId === projectId &&
           e.method === normalizedMethod &&
           e.path.toLowerCase() === cleanPath.toLowerCase()
    );
    if (isDuplicate) {
      return res.status(409).json({
        message: `An endpoint for ${normalizedMethod} ${cleanPath} already exists in project "${project.name}".`,
      });
    }

    const newEndpoint: Endpoint = {
      id: `e_${uuidv4().slice(0, 8)}`,
      projectId,
      name: name.trim(),
      path: cleanPath,
      method: normalizedMethod,
      status: 'healthy',
      healthScore: 100,
      degradationReason: 'Initial setup — Pending first health check',
      lastStatusCode: undefined,
      latencyThresholdMs: Number(latencyThresholdMs) || 500,
      interval: Number(interval) || 60,
      expectedStatus: Number(expectedStatus) || 200,
      timeout: Number(timeout) || 5000,
      headers,
      body,
      responseTimeP50: 0,
      responseTimeP95: 0,
      responseTimeP99: 0,
      uptime: 100,
      requestsPerMin: 0,
      errorRate: 0,
      lastChecked: new Date().toISOString(),
      tags: Array.isArray(tags) ? tags : [],
    };

    // Save to SQLite
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT OR REPLACE INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, health_score, degradation_reason, last_status_code, latency_threshold_ms, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newEndpoint.id, newEndpoint.projectId, newEndpoint.name, newEndpoint.path, newEndpoint.method, newEndpoint.status, newEndpoint.interval, newEndpoint.expectedStatus, newEndpoint.timeout, newEndpoint.responseTimeP50, newEndpoint.responseTimeP95, newEndpoint.responseTimeP99, newEndpoint.uptime, newEndpoint.requestsPerMin, newEndpoint.errorRate, newEndpoint.healthScore, newEndpoint.degradationReason, newEndpoint.lastStatusCode || null, newEndpoint.latencyThresholdMs, newEndpoint.lastChecked]
        );
      } catch (err: any) {
        console.warn('[Endpoints] SQLite insert error:', err.message);
      }
    }

    // Save to PostgreSQL if connected
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'INSERT INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, health_score, degradation_reason, last_status_code, latency_threshold_ms, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)',
          [newEndpoint.id, newEndpoint.projectId, newEndpoint.name, newEndpoint.path, newEndpoint.method, newEndpoint.status, newEndpoint.interval, newEndpoint.expectedStatus, newEndpoint.timeout, newEndpoint.responseTimeP50, newEndpoint.responseTimeP95, newEndpoint.responseTimeP99, newEndpoint.uptime, newEndpoint.requestsPerMin, newEndpoint.errorRate, newEndpoint.healthScore, newEndpoint.degradationReason, newEndpoint.lastStatusCode || null, newEndpoint.latencyThresholdMs, newEndpoint.lastChecked]
        );
      } catch (err: any) {
        console.warn('[Endpoints] Postgres insert error:', err.message);
      }
    }

    db.endpoints.unshift(newEndpoint);

    // Update project endpoint count
    project.endpointCount = db.endpoints.filter(e => e.projectId === projectId).length;
    project.updatedAt = new Date().toISOString();
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('UPDATE projects SET endpoint_count = ? WHERE id = ?', [project.endpointCount, project.id]);
      } catch {}
    }

    db.save();
    return res.status(201).json(newEndpoint);
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.endpoints.findIndex(e => e.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }

    const existing = db.endpoints[index];
    const project = db.projects.find(p => p.id === existing.projectId);

    // Path & Method validation if updating
    let cleanPath = existing.path;
    if (req.body.path) {
      cleanPath = req.body.path.trim().startsWith('/') ? req.body.path.trim() : `/${req.body.path.trim()}`;
      if (project) {
        const urlValidation = healthService.validateEndpointUrl(project.baseUrl, cleanPath);
        if (!urlValidation.isValid) {
          return res.status(400).json({ message: urlValidation.error || 'Invalid endpoint URL path' });
        }
      }
    }

    const updatedMethod = req.body.method ? (req.body.method.toUpperCase() as HttpMethod) : existing.method;

    // Check duplicate if path or method changed
    if (cleanPath !== existing.path || updatedMethod !== existing.method) {
      const isDuplicate = db.endpoints.some(
        e => e.id !== id &&
             e.projectId === existing.projectId &&
             e.method === updatedMethod &&
             e.path.toLowerCase() === cleanPath.toLowerCase()
      );
      if (isDuplicate) {
        return res.status(409).json({
          message: `An endpoint for ${updatedMethod} ${cleanPath} already exists in this project.`,
        });
      }
    }

    const updated: Endpoint = {
      ...existing,
      ...req.body,
      id: existing.id,
      projectId: existing.projectId,
      path: cleanPath,
      method: updatedMethod,
      interval: req.body.interval !== undefined ? Number(req.body.interval) : existing.interval,
      expectedStatus: req.body.expectedStatus !== undefined ? Number(req.body.expectedStatus) : existing.expectedStatus,
      timeout: req.body.timeout !== undefined ? Number(req.body.timeout) : existing.timeout,
      latencyThresholdMs: req.body.latencyThresholdMs !== undefined ? Number(req.body.latencyThresholdMs) : (existing.latencyThresholdMs || 500),
    };

    db.endpoints[index] = updated;

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE endpoints SET name = ?, path = ?, method = ?, status = ?, interval_sec = ?, expected_status = ?, timeout_ms = ?, latency_threshold_ms = ? WHERE id = ?',
          [updated.name, updated.path, updated.method, updated.status, updated.interval, updated.expectedStatus, updated.timeout, updated.latencyThresholdMs, id]
        );
      } catch (err: any) {
        console.warn('[Endpoints] SQLite update error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'UPDATE endpoints SET name = $1, path = $2, method = $3, status = $4, interval_sec = $5, expected_status = $6, timeout_ms = $7, latency_threshold_ms = $8 WHERE id = $9',
          [updated.name, updated.path, updated.method, updated.status, updated.interval, updated.expectedStatus, updated.timeout, updated.latencyThresholdMs, id]
        );
      } catch (err: any) {
        console.warn('[Endpoints] Postgres update error:', err.message);
      }
    }

    db.save();
    return res.json(updated);
  },

  delete: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.endpoints.findIndex(e => e.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }

    const removed = db.endpoints.splice(index, 1)[0];

    const project = db.projects.find(p => p.id === removed.projectId);
    if (project) {
      project.endpointCount = db.endpoints.filter(e => e.projectId === removed.projectId).length;
      project.updatedAt = new Date().toISOString();
      if (sqliteService.isConnected) {
        try {
          sqliteService.execute('UPDATE projects SET endpoint_count = ? WHERE id = ?', [project.endpointCount, project.id]);
        } catch {}
      }
    }

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('DELETE FROM endpoints WHERE id = ?', [id]);
        sqliteService.execute('DELETE FROM request_logs WHERE endpoint_id = ?', [id]);
        sqliteService.execute('DELETE FROM alerts WHERE endpoint_id = ?', [id]);
      } catch {}
    }

    db.save();
    return res.json({ message: `Endpoint "${removed.name}" removed successfully.` });
  },

  checkNow: async (req: Request, res: Response) => {
    const { id } = req.params;
    const endpoint = db.endpoints.find(e => e.id === id);
    if (!endpoint) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }

    // Concurrency Protection: Prevent duplicate concurrent checks for same endpoint
    if (activeChecks.has(id)) {
      return res.status(429).json({ message: 'A health check is already in progress for this endpoint. Please wait.' });
    }
    activeChecks.add(id);

    try {
      const project = db.projects.find(p => p.id === endpoint.projectId);
      if (!project || project.status === 'deleted' || project.deletedAt) {
        return res.status(400).json({ message: 'Cannot execute check: Parent project is deleted or inactive' });
      }

      // Safe URL Construction
      const targetUrl = healthService.buildFullUrl(project.baseUrl, endpoint.path);

      const startTime = Date.now();
      let measuredRt = 0;
      let statusCode = 200;
      let isSuccess = true;
      let failureType: RequestLog['failureType'] = 'none';
      let errorMessage: string | undefined;

      try {
        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
          const response = await axios({
            method: endpoint.method.toLowerCase(),
            url: targetUrl,
            timeout: Math.min(endpoint.timeout || 5000, 5000),
            validateStatus: () => true, // Don't throw on 4xx/5xx so we read actual HTTP status code
            headers: endpoint.headers || {},
          });
          measuredRt = Date.now() - startTime;
          statusCode = response.status;
          isSuccess = statusCode === (endpoint.expectedStatus || 200);
          if (!isSuccess) {
            failureType = 'unexpected_status';
            errorMessage = `Received HTTP ${statusCode}, expected ${endpoint.expectedStatus || 200}`;
          }
        } else {
          // Local/non-network simulated check for synthetic paths
          measuredRt = Math.floor(35 + Math.random() * 45);
          if (endpoint.path.includes('/500') || endpoint.path.includes('error') || endpoint.path.includes('fail')) {
            statusCode = 500;
            isSuccess = false;
            failureType = 'unexpected_status';
            errorMessage = 'Simulated 500 Internal Server Error';
          } else if (endpoint.path.includes('/404')) {
            statusCode = 404;
            isSuccess = false;
            failureType = 'unexpected_status';
            errorMessage = 'HTTP 404 Not Found';
          } else {
            statusCode = endpoint.expectedStatus || 200;
            isSuccess = true;
            failureType = 'none';
          }
        }
      } catch (err: any) {
        measuredRt = Date.now() - startTime;
        isSuccess = false;
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          failureType = 'timeout';
          statusCode = 504;
          errorMessage = `Request timed out after ${endpoint.timeout || 5000}ms`;
        } else if (err.code === 'ECONNREFUSED') {
          failureType = 'connection_refused';
          statusCode = 502;
          errorMessage = 'Connection refused by target server';
        } else if (targetUrl.includes('/500') || endpoint.path.includes('/500')) {
          failureType = 'unexpected_status';
          statusCode = 500;
          errorMessage = err.message || '500 Internal Server Error';
        } else {
          failureType = 'network_error';
          statusCode = 503;
          errorMessage = err.message || 'Target host unreachable or connection failed';
        }
      }

      // Record RequestLog
      const newLog: RequestLog = {
        id: `log_${uuidv4().slice(0, 8)}`,
        endpointId: endpoint.id,
        projectId: endpoint.projectId,
        method: endpoint.method,
        path: endpoint.path,
        statusCode,
        responseTime: measuredRt,
        requestSize: 256,
        responseSize: 1024,
        ip: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'API-Pulse-Client/1.0',
        timestamp: new Date().toISOString(),
        failureType,
        error: errorMessage,
      };

      db.logs.unshift(newLog);
      if (db.logs.length > 500) db.logs.pop();

      // Retrieve recent historical logs for this endpoint
      const recentLogs = db.logs.filter(l => l.endpointId === endpoint.id);

      // Comprehensive Health Scoring Engine
      const healthResult = healthService.calculateHealth({
        currentStatusCode: statusCode,
        currentResponseTime: measuredRt,
        expectedStatus: endpoint.expectedStatus || 200,
        latencyThresholdMs: endpoint.latencyThresholdMs || 500,
        failureType,
        recentLogs,
        timeout: endpoint.timeout || 5000,
      });

      // Update endpoint state from actual historical measurements
      endpoint.lastChecked = new Date().toISOString();
      endpoint.lastStatusCode = statusCode;
      endpoint.status = healthResult.status;
      endpoint.healthScore = healthResult.healthScore;
      endpoint.degradationReason = healthResult.degradationReason;
      endpoint.responseTimeP50 = healthResult.responseTimeP50;
      endpoint.responseTimeP95 = healthResult.responseTimeP95;
      endpoint.responseTimeP99 = healthResult.responseTimeP99;
      endpoint.uptime = healthResult.uptime;

      // Persist endpoint status to SQLite
      if (sqliteService.isConnected) {
        try {
          sqliteService.execute(
            'UPDATE endpoints SET status = ?, health_score = ?, degradation_reason = ?, last_status_code = ?, p50_ms = ?, p95_ms = ?, p99_ms = ?, uptime = ?, last_checked = ? WHERE id = ?',
            [endpoint.status, endpoint.healthScore, endpoint.degradationReason, endpoint.lastStatusCode, endpoint.responseTimeP50, endpoint.responseTimeP95, endpoint.responseTimeP99, endpoint.uptime, endpoint.lastChecked, endpoint.id]
          );
          sqliteService.execute(
            'INSERT INTO request_logs (id, endpoint_id, project_id, method, path, status_code, response_time_ms, request_size, response_size, ip_address, user_agent, failure_type, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [newLog.id, newLog.endpointId, newLog.projectId, newLog.method, newLog.path, newLog.statusCode, newLog.responseTime, newLog.requestSize, newLog.responseSize, newLog.ip, newLog.userAgent, newLog.failureType, newLog.error || null, newLog.timestamp]
          );
        } catch (err: any) {
          console.warn('[Endpoints] SQLite update checkNow error:', err.message);
        }
      }

      // Persist to PostgreSQL if connected
      if (postgresService.isConnected) {
        try {
          await postgresService.query(
            'UPDATE endpoints SET status = $1, health_score = $2, degradation_reason = $3, last_status_code = $4, p50_ms = $5, p95_ms = $6, p99_ms = $7, uptime = $8, last_checked = $9 WHERE id = $10',
            [endpoint.status, endpoint.healthScore, endpoint.degradationReason, endpoint.lastStatusCode, endpoint.responseTimeP50, endpoint.responseTimeP95, endpoint.responseTimeP99, endpoint.uptime, endpoint.lastChecked, endpoint.id]
          );
        } catch (err: any) {
          console.warn('[Endpoints] Postgres update checkNow error:', err.message);
        }
      }

      // Auto-raise Issue / Alert when health is degraded or down
      let raisedAlert: Alert | null = null;
      if (endpoint.status === 'down' || endpoint.status === 'degraded') {
        const alertSeverity: Alert['severity'] = endpoint.status === 'down' ? 'critical' : 'high';
        const alertTitle = endpoint.status === 'down'
          ? `Outage Detected: ${endpoint.method} ${endpoint.path} is DOWN`
          : `Health Degraded on ${endpoint.method} ${endpoint.path}`;

        const alertMsg = endpoint.degradationReason || `Health check failed: HTTP ${statusCode} in ${measuredRt}ms`;

        // Check if active alert already exists
        const existingAlert = db.alerts.find(a => a.endpointId === endpoint.id && a.status === 'active');
        if (!existingAlert) {
          raisedAlert = {
            id: `alt_${uuidv4().slice(0, 8)}`,
            ruleId: 'system_auto_detector',
            projectId: endpoint.projectId,
            endpointId: endpoint.id,
            title: alertTitle,
            message: alertMsg,
            severity: alertSeverity,
            status: 'active',
            triggeredAt: new Date().toISOString(),
            value: statusCode,
            threshold: endpoint.expectedStatus || 200,
          };

          if (sqliteService.isConnected) {
            try {
              sqliteService.execute(
                'INSERT INTO alerts (id, rule_id, project_id, endpoint_id, title, message, severity, status, triggered_at, current_value, threshold_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [raisedAlert.id, raisedAlert.ruleId, raisedAlert.projectId, raisedAlert.endpointId, raisedAlert.title, raisedAlert.message, raisedAlert.severity, raisedAlert.status, raisedAlert.triggeredAt, raisedAlert.value, raisedAlert.threshold]
              );
            } catch {}
          }

          db.alerts.unshift(raisedAlert);
          if (db.alerts.length > 200) db.alerts.pop();

          // Generate AI Root Cause
          try {
            await aiService.analyzeEndpoint(endpoint.id);
          } catch {}
        }
      } else {
        // If recovered to healthy, auto-resolve previous active alerts
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

      // Update parent project's average health score
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

      db.save();

      const latestInsight = db.aiInsights.find(i => i.endpointId === endpoint.id);

      return res.json({
        status: endpoint.status,
        statusCode,
        responseTime: measuredRt,
        healthScore: endpoint.healthScore,
        degradationReason: endpoint.degradationReason,
        uptime: endpoint.uptime,
        responseTimeP50: endpoint.responseTimeP50,
        responseTimeP95: endpoint.responseTimeP95,
        failureType,
        error: errorMessage,
        alert: raisedAlert,
        aiInsight: latestInsight,
        endpoint,
      });
    } finally {
      activeChecks.delete(id);
    }
  },
};
