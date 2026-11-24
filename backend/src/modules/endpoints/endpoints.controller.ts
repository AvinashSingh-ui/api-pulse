import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Endpoint, RequestLog, HttpMethod, Alert, AppNotification } from '../../types/index.js';
import { aiService } from '../ai/ai.service.js';
import { healthService } from '../monitoring/health.service.js';
import { notificationService } from '../notifications/notification.service.js';
import { apiExecutionService } from '../monitoring/apiExecution.service.js';

// In-flight check tracker to prevent duplicate concurrent checks for the same endpoint
const activeChecks = new Set<string>();

export const endpointsController = {
  list: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 1000;
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

    let normalizedHeaders: Record<string, string> = {};
    if (headers) {
      if (typeof headers === 'string') {
        try { normalizedHeaders = JSON.parse(headers); } catch {}
      } else if (typeof headers === 'object') {
        normalizedHeaders = headers;
      }
    }

    const normalizedBody = body !== undefined && body !== null && body !== ''
      ? (typeof body === 'string' ? body : JSON.stringify(body))
      : undefined;

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
      headers: normalizedHeaders,
      body: normalizedBody,
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
          'INSERT OR REPLACE INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, health_score, degradation_reason, last_status_code, latency_threshold_ms, headers, body, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newEndpoint.id, newEndpoint.projectId, newEndpoint.name, newEndpoint.path, newEndpoint.method, newEndpoint.status, newEndpoint.interval, newEndpoint.expectedStatus, newEndpoint.timeout, newEndpoint.responseTimeP50, newEndpoint.responseTimeP95, newEndpoint.responseTimeP99, newEndpoint.uptime, newEndpoint.requestsPerMin, newEndpoint.errorRate, newEndpoint.healthScore, newEndpoint.degradationReason, newEndpoint.lastStatusCode || null, newEndpoint.latencyThresholdMs, JSON.stringify(newEndpoint.headers || {}), newEndpoint.body || null, newEndpoint.lastChecked]
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

    let updatedHeaders = existing.headers;
    if (req.body.headers !== undefined) {
      if (typeof req.body.headers === 'string') {
        try { updatedHeaders = JSON.parse(req.body.headers); } catch { updatedHeaders = {}; }
      } else if (typeof req.body.headers === 'object') {
        updatedHeaders = req.body.headers;
      }
    }

    let updatedBody = existing.body;
    if (req.body.body !== undefined) {
      updatedBody = typeof req.body.body === 'string' ? req.body.body : JSON.stringify(req.body.body);
    }

    const updated: Endpoint = {
      ...existing,
      ...req.body,
      id: existing.id,
      projectId: existing.projectId,
      path: cleanPath,
      method: updatedMethod,
      headers: updatedHeaders,
      body: updatedBody,
      interval: req.body.interval !== undefined ? Number(req.body.interval) : existing.interval,
      expectedStatus: req.body.expectedStatus !== undefined ? Number(req.body.expectedStatus) : existing.expectedStatus,
      timeout: req.body.timeout !== undefined ? Number(req.body.timeout) : existing.timeout,
      latencyThresholdMs: req.body.latencyThresholdMs !== undefined ? Number(req.body.latencyThresholdMs) : (existing.latencyThresholdMs || 500),
    };

    db.endpoints[index] = updated;

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE endpoints SET name = ?, path = ?, method = ?, status = ?, interval_sec = ?, expected_status = ?, timeout_ms = ?, latency_threshold_ms = ?, headers = ?, body = ? WHERE id = ?',
          [updated.name, updated.path, updated.method, updated.status, updated.interval, updated.expectedStatus, updated.timeout, updated.latencyThresholdMs, JSON.stringify(updated.headers || {}), updated.body || null, id]
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

    if (activeChecks.has(id)) {
      return res.status(429).json({ message: 'A health check is already in progress for this endpoint. Please wait.' });
    }
    activeChecks.add(id);

    try {
      const execResult = await apiExecutionService.executeEndpointCheck(
        endpoint,
        req.ip || '127.0.0.1',
        (req.headers['user-agent'] as string) || 'API-Pulse-Client/1.0'
      );

      const latestInsight = db.aiInsights.find(i => i.endpointId === endpoint.id);

      return res.json({
        status: endpoint.status,
        statusCode: execResult.statusCode,
        responseTime: execResult.responseTime,
        healthScore: endpoint.healthScore,
        degradationReason: endpoint.degradationReason,
        uptime: endpoint.uptime,
        responseTimeP50: endpoint.responseTimeP50,
        responseTimeP95: endpoint.responseTimeP95,
        failureType: execResult.failureType,
        error: execResult.errorMessage,
        alert: execResult.raisedAlert,
        notification: execResult.triggeredNotification,
        aiInsight: latestInsight,
        endpoint,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || 'Health check execution failed' });
    } finally {
      activeChecks.delete(id);
    }
  },

  checkAll: async (req: Request, res: Response) => {
    try {
      const { projectId } = req.body || {};
      const activeProjectIds = new Set(
        db.projects
          .filter(p => p.status === 'active' && !p.deletedAt && (!projectId || p.id === projectId))
          .map(p => p.id)
      );

      const endpointsToCheck = db.endpoints.filter(
        e => e.status !== 'paused' && activeProjectIds.has(e.projectId)
      );

      const results: any[] = [];
      const triggeredNotifications: AppNotification[] = [];
      let healthyCount = 0;
      let degradedCount = 0;
      let unhealthyCount = 0;

      // Parallelize execution with concurrency of 15 to complete in 5-10s without socket starvation
      const CONCURRENCY = 15;
      for (let i = 0; i < endpointsToCheck.length; i += CONCURRENCY) {
        const batch = endpointsToCheck.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (ep) => {
            try {
              const execResult = await apiExecutionService.executeEndpointCheck(
                ep,
                req.ip || '127.0.0.1',
                (req.headers['user-agent'] as string) || 'API-Pulse-Client/1.0',
                true // isManualTrigger
              );

              if (execResult.triggeredNotification) {
                triggeredNotifications.push(execResult.triggeredNotification);
              }

              if (ep.status === 'healthy') healthyCount++;
              else if (ep.status === 'degraded') degradedCount++;
              else unhealthyCount++;

              results.push({
                id: ep.id,
                name: ep.name,
                method: ep.method,
                path: ep.path,
                status: ep.status,
                statusCode: execResult.statusCode,
                responseTime: execResult.responseTime,
                healthScore: ep.healthScore,
                degradationReason: ep.degradationReason,
                uptime: ep.uptime,
                responseTimeP50: ep.responseTimeP50,
                responseTimeP95: ep.responseTimeP95,
                lastChecked: ep.lastChecked,
              });
            } catch (err: any) {
              console.warn(`[Endpoints] Error checking ${ep.id}:`, err.message);
            }
          })
        );
      }

      db.save();
      return res.json({
        message: `Successfully executed health checks for ${results.length} endpoint(s).`,
        totalChecked: results.length,
        healthyCount,
        degradedCount,
        unhealthyCount,
        notifications: triggeredNotifications,
        results,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || 'Failed to execute batch checks' });
    }
  },
};
