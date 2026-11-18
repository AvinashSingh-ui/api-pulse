import YAML from 'yaml';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Endpoint, HttpMethod, Project } from '../../types/index.js';

export type ImportFormat = 'auto' | 'openapi' | 'postman' | 'curl' | 'routes';

export interface ParsedEndpointPreview {
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  responseSchemaAvailable: boolean;
  action: 'create' | 'update' | 'noop';
  headers?: Record<string, string>;
  body?: string;
}

export interface ImportPreviewResult {
  format: 'openapi' | 'postman' | 'curl' | 'routes';
  title: string;
  version: string;
  suggestedBaseUrl?: string;
  totalOperations: number;
  createCount: number;
  updateCount: number;
  deactivateCount: number;
  endpoints: ParsedEndpointPreview[];
  rawDoc?: any;
}

export interface NewProjectPayload {
  name: string;
  baseUrl: string;
  environment?: 'production' | 'staging' | 'development';
  description?: string;
  tags?: string[];
}

const VALID_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export const openapiService = {
  detectFormat: (content: string): 'openapi' | 'postman' | 'curl' | 'routes' => {
    const trimmed = content.trim();
    if (/^\s*curl\b/m.test(trimmed)) {
      return 'curl';
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.info && (Array.isArray(parsed.item) || parsed.info.schema?.includes('postman'))) {
        return 'postman';
      }
      if (parsed.openapi || parsed.swagger || parsed.paths) {
        return 'openapi';
      }
    } catch {
      // not JSON
    }
    if (
      /^openapi:\s*['"]?[23]\./im.test(trimmed) ||
      /^swagger:\s*['"]?2\./im.test(trimmed) ||
      /\npaths:\s*\n/im.test(trimmed)
    ) {
      return 'openapi';
    }
    return 'routes';
  },

  parseSpec: (rawContent: string): any => {
    try {
      return JSON.parse(rawContent);
    } catch {
      return YAML.parse(rawContent);
    }
  },

  // 1. OpenAPI & Swagger Parser
  parseOpenApiSpec: (doc: any, existingEndpoints: Endpoint[]) => {
    const paths = doc.paths || {};
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;

    let suggestedBaseUrl: string | undefined;
    if (Array.isArray(doc.servers) && doc.servers[0]?.url) {
      suggestedBaseUrl = doc.servers[0].url;
    } else if (doc.host) {
      const scheme = Array.isArray(doc.schemes) && doc.schemes[0] ? doc.schemes[0] : 'https';
      suggestedBaseUrl = `${scheme}://${doc.host}${doc.basePath || ''}`;
    }

    for (const [pathKey, pathItem] of Object.entries(paths as Record<string, any>)) {
      for (const [methodKey, rawOp] of Object.entries((pathItem || {}) as Record<string, any>)) {
        const op = rawOp as any;
        const upperMethod = methodKey.toUpperCase() as HttpMethod;
        if (!VALID_METHODS.includes(upperMethod)) continue;

        const cleanPath = pathKey.startsWith('/') ? pathKey : `/${pathKey}`;
        const existing = existingEndpoints.find(
          e => e.path === cleanPath && e.method === upperMethod
        );

        const hasSchema = Boolean(
          op?.responses?.['200']?.content?.['application/json']?.schema ||
          op?.responses?.['201']?.content?.['application/json']?.schema
        );

        const action: 'create' | 'update' | 'noop' = existing ? 'update' : 'create';
        if (action === 'create') createCount++;
        else updateCount++;

        previews.push({
          method: upperMethod,
          path: cleanPath,
          operationId: op?.operationId || op?.summary || `${upperMethod} ${cleanPath}`,
          summary: op?.summary || op?.description || `${upperMethod} ${cleanPath}`,
          responseSchemaAvailable: hasSchema,
          action,
        });
      }
    }

    return {
      format: 'openapi' as const,
      title: doc.info?.title || 'OpenAPI Specification',
      version: doc.info?.version || '1.0.0',
      suggestedBaseUrl,
      totalOperations: previews.length,
      createCount,
      updateCount,
      deactivateCount: 0,
      endpoints: previews,
      rawDoc: doc,
    };
  },

  // 2. Postman Collection Parser (v2.0 & v2.1)
  parsePostmanCollection: (collection: any, existingEndpoints: Endpoint[]) => {
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;
    let detectedOrigin: string | undefined;

    function extractItems(items: any[]): any[] {
      let result: any[] = [];
      for (const it of items) {
        if (it.request) {
          result.push(it);
        }
        if (Array.isArray(it.item)) {
          result = result.concat(extractItems(it.item));
        }
      }
      return result;
    }

    const allRequests = Array.isArray(collection.item) ? extractItems(collection.item) : [];

    for (const reqItem of allRequests) {
      const req = reqItem.request || {};
      const method = (req.method || 'GET').toUpperCase() as HttpMethod;
      if (!VALID_METHODS.includes(method)) continue;

      let extractedPath = '/';
      const rawUrl = typeof req.url === 'string' ? req.url : req.url?.raw || '';

      if (rawUrl) {
        try {
          if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
            const parsedUrl = new URL(rawUrl);
            extractedPath = parsedUrl.pathname || '/';
            if (!detectedOrigin) {
              detectedOrigin = parsedUrl.origin;
            }
          } else {
            extractedPath = rawUrl.replace(/^https?:\/\/[^\/]+/, '') || '/';
          }
        } catch {
          extractedPath = rawUrl.replace(/^https?:\/\/[^\/]+/, '') || '/';
        }
      } else if (req.url?.path) {
        extractedPath = '/' + (Array.isArray(req.url.path) ? req.url.path.join('/') : req.url.path);
      }

      if (!extractedPath.startsWith('/')) {
        extractedPath = `/${extractedPath}`;
      }

      // Check existing
      const existing = existingEndpoints.find(
        e => e.path === extractedPath && e.method === method
      );

      const action: 'create' | 'update' | 'noop' = existing ? 'update' : 'create';
      if (action === 'create') createCount++;
      else updateCount++;

      previews.push({
        method,
        path: extractedPath,
        operationId: reqItem.name || `${method} ${extractedPath}`,
        summary: reqItem.name || req.description || `${method} ${extractedPath}`,
        responseSchemaAvailable: false,
        action,
      });
    }

    return {
      format: 'postman' as const,
      title: collection.info?.name || 'Postman Collection Import',
      version: '2.1.0',
      suggestedBaseUrl: detectedOrigin,
      totalOperations: previews.length,
      createCount,
      updateCount,
      deactivateCount: 0,
      endpoints: previews,
      rawDoc: collection,
    };
  },

  // 3. cURL Command(s) Parser
  parseCurlCommands: (curlText: string, existingEndpoints: Endpoint[]) => {
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;
    let detectedOrigin: string | undefined;

    // Split on curl invocations
    const cleaned = curlText.replace(/\\\r?\n/g, ' '); // join bash continuation lines
    const commands = cleaned.split(/(?=curl\s+)/g).filter(c => c.trim().startsWith('curl'));

    const list = commands.length > 0 ? commands : [cleaned];

    for (const cmd of list) {
      if (!cmd.trim()) continue;

      // Detect Method
      let method: HttpMethod = 'GET';
      const methodMatch = cmd.match(/(?:-X|--request)\s+['"]?([A-Za-z]+)['"]?/i);
      if (methodMatch && VALID_METHODS.includes(methodMatch[1].toUpperCase() as HttpMethod)) {
        method = methodMatch[1].toUpperCase() as HttpMethod;
      } else if (/(-d|--data|--data-raw|--data-json)\s+/i.test(cmd)) {
        method = 'POST';
      }

      // Detect URL
      const urlMatch = cmd.match(/https?:\/\/[^\s'"]+/i) || cmd.match(/['"](https?:\/\/[^'"]+)['"]/i);
      let path = '/';
      if (urlMatch) {
        const fullUrl = urlMatch[1] || urlMatch[0];
        try {
          const parsed = new URL(fullUrl);
          path = parsed.pathname || '/';
          if (!detectedOrigin) {
            detectedOrigin = parsed.origin;
          }
        } catch {
          path = fullUrl.replace(/^https?:\/\/[^\/]+/, '') || '/';
        }
      } else {
        // Look for relative path like /api/v1/...
        const relMatch = cmd.match(/(?:\s|^)(['"]?)(\/[a-zA-Z0-9_\-\.\/]+)\1/);
        if (relMatch) {
          path = relMatch[2];
        }
      }

      if (!path.startsWith('/')) {
        path = `/${path}`;
      }

      const existing = existingEndpoints.find(
        e => e.path === path && e.method === method
      );

      const action: 'create' | 'update' | 'noop' = existing ? 'update' : 'create';
      if (action === 'create') createCount++;
      else updateCount++;

      previews.push({
        method,
        path,
        operationId: `curl_${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        summary: `cURL ${method} ${path}`,
        responseSchemaAvailable: false,
        action,
      });
    }

    return {
      format: 'curl' as const,
      title: 'cURL Command Import',
      version: '1.0.0',
      suggestedBaseUrl: detectedOrigin,
      totalOperations: previews.length,
      createCount,
      updateCount,
      deactivateCount: 0,
      endpoints: previews,
    };
  },

  // 4. Batch Route List Parser (e.g. "GET /api/v1/users", "POST /api/v1/orders")
  parseRouteList: (text: string, existingEndpoints: Endpoint[]) => {
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;
    let detectedOrigin: string | undefined;

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));

    for (const line of lines) {
      // Format: [METHOD] [PATH/URL] [optional - summary]
      // Examples:
      // "GET /api/v1/users"
      // "POST https://api.example.com/api/v1/orders - Create Order"
      // "/api/health"
      const match = line.match(/^([A-Za-z]+)?\s*(\S+)(?:\s*[-–:]\s*(.+))?$/);
      if (!match) continue;

      let rawMethod = match[1]?.toUpperCase() || 'GET';
      let rawTarget = match[2];
      let summary = match[3] || '';

      // Check if first token was actually a path starting with / or http
      if (!VALID_METHODS.includes(rawMethod as HttpMethod) && (rawMethod.startsWith('/') || rawMethod.startsWith('http'))) {
        rawTarget = rawMethod;
        rawMethod = 'GET';
        summary = match[2] || '';
      }

      const method = (VALID_METHODS.includes(rawMethod as HttpMethod) ? rawMethod : 'GET') as HttpMethod;
      let path = '/';

      if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://')) {
        try {
          const parsed = new URL(rawTarget);
          path = parsed.pathname || '/';
          if (!detectedOrigin) {
            detectedOrigin = parsed.origin;
          }
        } catch {
          path = rawTarget.replace(/^https?:\/\/[^\/]+/, '') || '/';
        }
      } else {
        path = rawTarget.startsWith('/') ? rawTarget : `/${rawTarget}`;
      }

      const existing = existingEndpoints.find(
        e => e.path === path && e.method === method
      );

      const action: 'create' | 'update' | 'noop' = existing ? 'update' : 'create';
      if (action === 'create') createCount++;
      else updateCount++;

      previews.push({
        method,
        path,
        operationId: `${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        summary: summary || `${method} ${path}`,
        responseSchemaAvailable: false,
        action,
      });
    }

    return {
      format: 'routes' as const,
      title: 'Bulk Route List Import',
      version: '1.0.0',
      suggestedBaseUrl: detectedOrigin,
      totalOperations: previews.length,
      createCount,
      updateCount,
      deactivateCount: 0,
      endpoints: previews,
    };
  },

  // Main Preview Dispatcher
  previewSpec: async (input: {
    rawContent?: string;
    url?: string;
    projectId?: string;
    format?: ImportFormat;
  }): Promise<ImportPreviewResult> => {
    let content = input.rawContent || '';
    if (input.url) {
      const res = await axios.get(input.url, { timeout: 8000 });
      content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }

    if (!content.trim()) {
      throw new Error('No API content, cURL commands, route definitions, or live URL provided.');
    }

    const existingEndpoints = input.projectId
      ? db.endpoints.filter(e => e.projectId === input.projectId)
      : [];

    let targetFormat = input.format && input.format !== 'auto'
      ? input.format
      : openapiService.detectFormat(content);

    if (targetFormat === 'curl') {
      return openapiService.parseCurlCommands(content, existingEndpoints);
    }

    if (targetFormat === 'postman') {
      try {
        const json = JSON.parse(content);
        return openapiService.parsePostmanCollection(json, existingEndpoints);
      } catch {
        // Fallback to auto/routes if json parse failed
      }
    }

    if (targetFormat === 'openapi') {
      try {
        const doc = openapiService.parseSpec(content);
        if (doc && (doc.openapi || doc.swagger || doc.paths)) {
          return openapiService.parseOpenApiSpec(doc, existingEndpoints);
        }
      } catch {
        // Fallback to route parser if YAML/JSON invalid
      }
    }

    // Default fallback: parse as route list
    return openapiService.parseRouteList(content, existingEndpoints);
  },

  // Apply Import to Project (or create new project atomically if requested)
  applyImport: async (
    targetProjectId: string | undefined,
    endpointsToApply: ParsedEndpointPreview[],
    newProjectData?: NewProjectPayload
  ) => {
    if (!Array.isArray(endpointsToApply) || endpointsToApply.length === 0) {
      throw new Error('No endpoints selected for import.');
    }

    let project: Project | undefined;

    // Atomic Project Creation if newProjectData is supplied or targetProjectId === 'new'
    if (newProjectData && (!targetProjectId || targetProjectId === 'new')) {
      if (!newProjectData.name || !newProjectData.baseUrl) {
        throw new Error('Project Name and Application Deployed Link / Base Server URL are required.');
      }
      const newProjId = `p_${uuidv4().slice(0, 8)}`;
      const createdProj: Project = {
        id: newProjId,
        name: newProjectData.name.trim(),
        description: newProjectData.description?.trim() || '',
        baseUrl: newProjectData.baseUrl.trim().replace(/\/+$/, ''),
        environment: newProjectData.environment || 'production',
        status: 'active',
        endpointCount: 0,
        healthScore: 100,
        tags: newProjectData.tags || ['imported'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      project = createdProj;
      db.projects.unshift(createdProj);

      // Persist new project to SQLite & Postgres
      if (sqliteService.isConnected) {
        try {
          sqliteService.execute(
            'INSERT OR REPLACE INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, user_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              createdProj.id,
              createdProj.name,
              createdProj.description || '',
              createdProj.status,
              createdProj.baseUrl,
              createdProj.environment,
              createdProj.endpointCount,
              createdProj.healthScore || 100,
              null,
              null,
              createdProj.createdAt,
              createdProj.updatedAt,
            ]
          );
        } catch (err: any) {
          console.warn('[OpenAPI/Projects] SQLite project insert error:', err.message);
        }
      }
      if (postgresService.isConnected) {
        try {
          await postgresService.query(
            'INSERT INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, deleted_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
            [createdProj.id, createdProj.name, createdProj.description || '', createdProj.status, createdProj.baseUrl, createdProj.environment, createdProj.endpointCount, createdProj.healthScore || 100, null, createdProj.createdAt, createdProj.updatedAt]
          );
        } catch (err: any) {
          console.warn('[OpenAPI/Projects] Postgres project insert error:', err.message);
        }
      }
    } else {
      project = db.projects.find(p => p.id === targetProjectId);
      if (!project) throw new Error(`Project ${targetProjectId} not found.`);
    }

    if (!project) {
      throw new Error('Target project could not be resolved.');
    }

    const targetProject = project;
    const projectId = targetProject.id;
    let addedCount = 0;
    let updatedCount = 0;

    for (const item of endpointsToApply) {
      const cleanPath = item.path.startsWith('/') ? item.path : `/${item.path}`;
      const existing = db.endpoints.find(
        e => e.projectId === projectId && e.path === cleanPath && e.method === item.method
      );

      if (existing) {
        existing.name = item.summary || item.operationId || existing.name;
        if (sqliteService.isConnected) {
          try {
            sqliteService.execute(
              'UPDATE endpoints SET name = ? WHERE id = ?',
              [existing.name, existing.id]
            );
          } catch {}
        }
        updatedCount++;
      } else {
        const newEp: Endpoint = {
          id: `e_${uuidv4().slice(0, 8)}`,
          projectId,
          name: item.summary || item.operationId || `${item.method} ${cleanPath}`,
          path: cleanPath,
          method: item.method,
          status: 'healthy',
          interval: 60,
          expectedStatus: item.method === 'POST' ? 201 : 200,
          timeout: 5000,
          responseTimeP50: 60,
          responseTimeP95: 140,
          responseTimeP99: 220,
          uptime: 100,
          requestsPerMin: 20,
          errorRate: 0,
          healthScore: 100,
          latencyThresholdMs: 500,
          lastChecked: new Date().toISOString(),
          tags: ['imported'],
        };
        db.endpoints.unshift(newEp);

        // Persist to SQLite
        if (sqliteService.isConnected) {
          try {
            sqliteService.execute(
              'INSERT INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, health_score, latency_threshold_ms, last_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [newEp.id, newEp.projectId, newEp.name, newEp.path, newEp.method, newEp.status, newEp.interval, newEp.expectedStatus, newEp.timeout, newEp.responseTimeP50, newEp.responseTimeP95, newEp.responseTimeP99, newEp.uptime, newEp.requestsPerMin, newEp.errorRate, newEp.healthScore, newEp.latencyThresholdMs, newEp.lastChecked]
            );
          } catch (err: any) {
            console.warn('[OpenAPI/Endpoints] SQLite insert error:', err.message);
          }
        }

        // Persist to Postgres
        if (postgresService.isConnected) {
          try {
            await postgresService.query(
              'INSERT INTO endpoints (id, project_id, name, path, method, status, interval_sec, expected_status, timeout_ms, p50_ms, p95_ms, p99_ms, uptime, requests_per_min, error_rate, health_score, latency_threshold_ms, last_checked) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)',
              [newEp.id, newEp.projectId, newEp.name, newEp.path, newEp.method, newEp.status, newEp.interval, newEp.expectedStatus, newEp.timeout, newEp.responseTimeP50, newEp.responseTimeP95, newEp.responseTimeP99, newEp.uptime, newEp.requestsPerMin, newEp.errorRate, newEp.healthScore, newEp.latencyThresholdMs, newEp.lastChecked]
            );
          } catch (err: any) {
            console.warn('[OpenAPI/Endpoints] Postgres insert error:', err.message);
          }
        }

        addedCount++;
      }
    }

    targetProject.endpointCount = db.endpoints.filter(e => e.projectId === projectId).length;
    targetProject.updatedAt = new Date().toISOString();

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('UPDATE projects SET endpoint_count = ?, updated_at = ? WHERE id = ?', [targetProject.endpointCount, targetProject.updatedAt, targetProject.id]);
      } catch {}
    }

    db.save();

    return {
      message: `Successfully imported endpoints: ${addedCount} created, ${updatedCount} updated.`,
      project: targetProject,
      addedCount,
      updatedCount,
      totalEndpoints: targetProject.endpointCount,
    };
  },
};
