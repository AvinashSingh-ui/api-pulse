import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Endpoint, RequestLog, HttpMethod, Alert } from '../../types/index.js';
import { aiService } from '../ai/ai.service.js';

export const endpointsController = {
  list: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);
    const search = (req.query.search as string || '').toLowerCase();
    const projectId = req.query.projectId as string;
    const method = req.query.method as string;
    const status = req.query.status as string;

    let items = db.endpoints;

    if (projectId) {
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
      items = items.filter(e => e.status === status);
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
    return res.json(endpoint);
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
      headers = {},
      body,
      tags = [],
    } = req.body;

    if (!projectId || !name || !path) {
      return res.status(400).json({ message: 'projectId, name, and path are required' });
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    const newEndpoint: Endpoint = {
      id: `e_${uuidv4().slice(0, 8)}`,
      projectId,
      name,
      path: cleanPath,
      method: method.toUpperCase() as HttpMethod,
      status: 'healthy',
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
      tags,
    };

    // Save to Real SQLite DB
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT OR REPLACE INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newEndpoint.id, newEndpoint.projectId, newEndpoint.name, newEndpoint.path, newEndpoint.method, newEndpoint.status, newEndpoint.interval, newEndpoint.expectedStatus, newEndpoint.timeout, newEndpoint.responseTimeP50, newEndpoint.responseTimeP95, newEndpoint.responseTimeP99, newEndpoint.uptime, newEndpoint.requestsPerMin, newEndpoint.errorRate, newEndpoint.lastChecked]
        );
      } catch (err: any) {
        console.warn('[Endpoints] SQLite error:', err.message);
      }
    }

    // Save to PostgreSQL if connected
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'INSERT INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)',
          [newEndpoint.id, newEndpoint.projectId, newEndpoint.name, newEndpoint.path, newEndpoint.method, newEndpoint.status, newEndpoint.interval, newEndpoint.expectedStatus, newEndpoint.timeout, newEndpoint.responseTimeP50, newEndpoint.responseTimeP95, newEndpoint.responseTimeP99, newEndpoint.uptime, newEndpoint.requestsPerMin, newEndpoint.errorRate, newEndpoint.lastChecked]
        );
      } catch (err: any) {
        console.warn('[Endpoints] Postgres error:', err.message);
      }
    }

    db.endpoints.unshift(newEndpoint);

    // Update project endpoint count
    const project = db.projects.find(p => p.id === projectId);
    if (project) {
      project.endpointCount = db.endpoints.filter(e => e.projectId === projectId).length;
      project.updatedAt = new Date().toISOString();
      if (sqliteService.isConnected) {
        try {
          sqliteService.execute('UPDATE projects SET endpoint_count = ? WHERE id = ?', [project.endpointCount, project.id]);
        } catch {}
      }
    }

    db.save();
    return res.status(201).json(newEndpoint);
  },

  update: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.endpoints.findIndex(e => e.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }

    const existing = db.endpoints[index];
    const updated: Endpoint = {
      ...existing,
      ...req.body,
      id: existing.id,
      projectId: existing.projectId,
    };

    db.endpoints[index] = updated;

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE endpoints SET name = ?, path = ?, method = ?, status = ?, interval_sec = ?, expected_status = ?, timeout_ms = ? WHERE id = ?',
          [updated.name, updated.path, updated.method, updated.status, updated.interval, updated.expectedStatus, updated.timeout, id]
        );
      } catch {}
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
      } catch {}
    }

    db.save();
    return res.json({ message: `Endpoint "${removed.name}" removed` });
  },

  checkNow: async (req: Request, res: Response) => {
    const { id } = req.params;
    const endpoint = db.endpoints.find(e => e.id === id);
    if (!endpoint) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }

    const project = db.projects.find(p => p.id === endpoint.projectId);
    const targetUrl = project ? `${project.baseUrl}${endpoint.path}` : endpoint.path;

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
          timeout: Math.min(endpoint.timeout || 3000, 3000),
          validateStatus: () => true,
          headers: endpoint.headers || {},
        });
        measuredRt = Date.now() - startTime;
        statusCode = response.status;
        isSuccess = statusCode === (endpoint.expectedStatus || 200);
        if (!isSuccess) {
          failureType = 'unexpected_status';
          errorMessage = `Received HTTP ${statusCode}, expected ${endpoint.expectedStatus}`;
        }
      } else {
        measuredRt = Math.floor(35 + Math.random() * 45);
        if (endpoint.path.includes('/500') || endpoint.path.includes('error') || endpoint.path.includes('fail')) {
          statusCode = 500;
          isSuccess = false;
          failureType = 'unexpected_status';
          errorMessage = 'Simulated 500 Internal Server Error';
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
        errorMessage = `Request timed out after ${endpoint.timeout}ms`;
      } else if (err.code === 'ECONNREFUSED') {
        failureType = 'connection_refused';
        statusCode = 502;
        errorMessage = 'Connection refused by target server';
      } else if (targetUrl.includes('/500') || endpoint.path.includes('/500')) {
        failureType = 'unexpected_status';
        statusCode = 500;
        errorMessage = err.message || 'Simulated 500 Internal Server Error';
      } else {
        failureType = 'network_error';
        statusCode = 503;
        errorMessage = err.message || 'Target host unreachable or connection failed';
      }
    }

    // Update endpoint state based on health check response
    endpoint.lastChecked = new Date().toISOString();
    endpoint.responseTimeP50 = measuredRt;
    endpoint.responseTimeP95 = Math.round(measuredRt * 1.5);
    
    // Status logic:
    // If statusCode >= 500 or connection failed => 'down'
    // Else if not expected status or high latency or 4xx => 'degraded'
    // Else => 'healthy'
    if (statusCode >= 500 || failureType === 'connection_refused') {
      endpoint.status = 'down';
    } else if (!isSuccess || statusCode >= 400 || measuredRt > (endpoint.timeout || 4000)) {
      endpoint.status = 'degraded';
    } else {
      endpoint.status = 'healthy';
    }

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE endpoints SET status = ?, p50_ms = ?, p95_ms = ?, last_checked = ? WHERE id = ?',
          [endpoint.status, endpoint.responseTimeP50, endpoint.responseTimeP95, endpoint.lastChecked, endpoint.id]
        );
      } catch (err: any) {
        console.warn('[Endpoints] SQLite update status error:', err.message);
      }
    }

    // Auto-raise Issue / Alert when health is degraded or down
    let raisedAlert: Alert | null = null;
    if (endpoint.status === 'down' || endpoint.status === 'degraded') {
      const alertSeverity: Alert['severity'] = endpoint.status === 'down' ? 'critical' : 'high';
      const alertTitle = endpoint.status === 'down'
        ? `Outage Detected: ${endpoint.method} ${endpoint.path} is DOWN`
        : `Health Degraded on ${endpoint.method} ${endpoint.path}`;

      const alertMsg = errorMessage || `Endpoint failed health check. Returned HTTP ${statusCode} (Expected ${endpoint.expectedStatus || 200}) with latency ${measuredRt}ms.`;

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
        } catch (err: any) {
          console.warn('[Alerts] SQLite insert alert error:', err.message);
        }
      }

      const matchedRule = db.alertRules.find(r => r.endpointId === endpoint.id || r.projectId === endpoint.projectId);
      const pgRuleId = matchedRule ? matchedRule.id : null;

      if (postgresService.isConnected) {
        try {
          await postgresService.query(
            'INSERT INTO alerts (id, rule_id, project_id, endpoint_id, title, message, severity, status, triggered_at, current_value, threshold_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [raisedAlert.id, pgRuleId, raisedAlert.projectId, raisedAlert.endpointId, raisedAlert.title, raisedAlert.message, raisedAlert.severity, raisedAlert.status, raisedAlert.triggeredAt, raisedAlert.value, raisedAlert.threshold]
          );
        } catch (err: any) {
          console.warn('[Alerts] Postgres insert alert error:', err.message);
        }
      }

      db.alerts.unshift(raisedAlert);
      if (db.alerts.length > 200) db.alerts.pop();

      // Automatically generate AI Root Cause Diagnosis
      try {
        await aiService.analyzeEndpoint(endpoint.id);
      } catch (err: any) {
        console.warn('[AI] Error generating auto root cause:', err.message);
      }
    } else {
      // If endpoint recovered to healthy, auto-resolve previous active alerts for this endpoint
      const activeForEp = db.alerts.filter(a => a.endpointId === endpoint.id && a.status === 'active');
      for (const a of activeForEp) {
        a.status = 'resolved';
        a.resolvedAt = new Date().toISOString();
        if (sqliteService.isConnected) {
          try {
            sqliteService.execute('UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?', ['resolved', a.resolvedAt, a.id]);
          } catch {}
        }
        if (postgresService.isConnected) {
          try {
            await postgresService.query('UPDATE alerts SET status = $1, resolved_at = $2 WHERE id = $3', ['resolved', a.resolvedAt, a.id]);
          } catch {}
        }
      }
    }

    // Log request
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

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT INTO request_logs (id, endpoint_id, project_id, method, path, status_code, response_time_ms, request_size, response_size, ip_address, user_agent, failure_type, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newLog.id, newLog.endpointId, newLog.projectId, newLog.method, newLog.path, newLog.statusCode, newLog.responseTime, newLog.requestSize, newLog.responseSize, newLog.ip, newLog.userAgent, newLog.failureType, newLog.error || null, newLog.timestamp]
        );
      } catch (err: any) {
        console.warn('[Endpoints] SQLite log error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'INSERT INTO request_logs (id, endpoint_id, project_id, method, path, status_code, response_time_ms, request_size, response_size, ip_address, user_agent, failure_type, error_message, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
          [newLog.id, newLog.endpointId, newLog.projectId, newLog.method, newLog.path, newLog.statusCode, newLog.responseTime, newLog.requestSize, newLog.responseSize, newLog.ip, newLog.userAgent, newLog.failureType, newLog.error || null, newLog.timestamp]
        );
      } catch (err: any) {
        console.warn('[Endpoints] Postgres log error:', err.message);
      }
    }

    db.logs.unshift(newLog);
    if (db.logs.length > 500) db.logs.pop();
    db.save();

    const latestInsight = db.aiInsights.find(i => i.endpointId === endpoint.id);

    return res.json({
      status: endpoint.status,
      statusCode,
      responseTime: measuredRt,
      failureType,
      error: errorMessage,
      alert: raisedAlert,
      aiInsight: latestInsight,
    });
  },
};
