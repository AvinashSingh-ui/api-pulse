import YAML from 'yaml';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Endpoint, HttpMethod, Project } from '../../types/index.js';
import { healthService } from '../monitoring/health.service.js';
import { generatePayloadFromSchema } from '../monitoring/apiExecution.service.js';

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
  contentType?: string;
  expectedStatus?: number;
  expectedStatuses?: number[];
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodySchema?: any;
  tags?: string[];
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
  bearerToken?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  headers?: Record<string, string>;
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

  /**
   * Intelligently resolves a live URL (including Swagger UI web pages) into actual OpenAPI JSON/YAML.
   */
  resolveLiveUrl: async (url: string): Promise<{ content: string; detectedBaseUrl?: string }> => {
    let target = url.trim();
    let res = await axios.get(target, { timeout: 10000, headers: { Accept: 'application/json, text/yaml, text/html, */*' } });
    let data = res.data;

    let origin = '';
    try {
      const parsed = new URL(target);
      origin = parsed.origin;
    } catch {}

    // If response is HTML (e.g. Swagger UI page)
    if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html') || data.includes('swagger-ui'))) {
      // 1. Try to find JSON/YAML spec URL inside HTML
      const matchUrl = data.match(/url\s*:\s*["']([^"']+\.(?:json|yaml|yml)[^"']*)["']/i) ||
                       data.match(/url\s*:\s*["'](\/[^"']+)["']/i) ||
                       data.match(/["'](https?:\/\/[^"']+\/(?:v[23]\/api-docs|swagger\.json|openapi\.json))["']/i);

      if (matchUrl && matchUrl[1]) {
        let specUrl = matchUrl[1];
        if (specUrl.startsWith('/')) {
          specUrl = `${origin}${specUrl}`;
        }
        try {
          const specRes = await axios.get(specUrl, { timeout: 10000 });
          return {
            content: typeof specRes.data === 'string' ? specRes.data : JSON.stringify(specRes.data),
            detectedBaseUrl: origin,
          };
        } catch {}
      }

      // 2. Try common OpenAPI/Swagger JSON routes on the host
      const commonEndpoints = [
        '/v3/api-docs',
        '/v3/api-docs/swagger-config',
        '/v2/api-docs',
        '/swagger/v1/swagger.json',
        '/swagger.json',
        '/openapi.json',
        '/api-docs',
      ];

      for (const ep of commonEndpoints) {
        try {
          const testRes = await axios.get(`${origin}${ep}`, { timeout: 6000 });
          if (testRes.data && (typeof testRes.data === 'object' || typeof testRes.data === 'string')) {
            const raw = typeof testRes.data === 'string' ? testRes.data : JSON.stringify(testRes.data);
            if (raw.includes('"paths"') || raw.includes('paths:')) {
              return { content: raw, detectedBaseUrl: origin };
            }
          }
        } catch {}
      }
    }

    return {
      content: typeof data === 'string' ? data : JSON.stringify(data),
      detectedBaseUrl: origin,
    };
  },

  // 1. OpenAPI & Swagger Parser (v2.0, v3.0, v3.1)
  parseOpenApiSpec: (doc: any, existingEndpoints: Endpoint[], detectedOrigin?: string) => {
    const paths = doc.paths || {};
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;

    let suggestedBaseUrl: string | undefined;
    if (Array.isArray(doc.servers) && doc.servers[0]?.url) {
      let sUrl = doc.servers[0].url;
      if (sUrl.startsWith('/') && detectedOrigin) {
        suggestedBaseUrl = `${detectedOrigin}${sUrl}`;
      } else {
        suggestedBaseUrl = sUrl;
      }
    } else if (doc.host) {
      const scheme = Array.isArray(doc.schemes) && doc.schemes[0] ? doc.schemes[0] : 'https';
      suggestedBaseUrl = `${scheme}://${doc.host}${doc.basePath || ''}`;
    } else if (detectedOrigin) {
      suggestedBaseUrl = detectedOrigin;
    }

    // Clean any trailing swagger-ui or docs paths from suggestedBaseUrl
    if (suggestedBaseUrl) {
      suggestedBaseUrl = healthService.cleanBaseUrl(suggestedBaseUrl);
    }

    // Global security check
    const docSecurity = Array.isArray(doc.security) ? doc.security : [];

    for (const [pathKey, rawPathItem] of Object.entries(paths as Record<string, any>)) {
      const pathItem = rawPathItem || {};
      const pathItemParameters: any[] = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

      for (const [methodKey, rawOp] of Object.entries(pathItem as Record<string, any>)) {
        if (methodKey === 'parameters' || methodKey === 'summary' || methodKey === 'description') continue;

        const op = rawOp as any;
        const upperMethod = methodKey.toUpperCase() as HttpMethod;
        if (!VALID_METHODS.includes(upperMethod)) continue;

        const cleanPath = pathKey.startsWith('/') ? pathKey : `/${pathKey}`;
        const existing = existingEndpoints.find(
          e => e.path === cleanPath && e.method === upperMethod
        );

        // Parameters extraction (operation-level + pathItem-level)
        const combinedParams: any[] = [
          ...pathItemParameters,
          ...(Array.isArray(op.parameters) ? op.parameters : []),
        ];

        const pathParams: Record<string, string> = {};
        const queryParams: Record<string, string> = {};
        const headers: Record<string, string> = {};

        for (const p of combinedParams) {
          if (!p || !p.name) continue;
          const sampleVal = p.example !== undefined ? String(p.example)
            : p.default !== undefined ? String(p.default)
            : p.schema ? String(generatePayloadFromSchema(p.schema))
            : '1';

          if (p.in === 'path') {
            pathParams[p.name] = sampleVal;
          } else if (p.in === 'query') {
            queryParams[p.name] = sampleVal;
          } else if (p.in === 'header') {
            headers[p.name] = sampleVal;
          }
        }

        // Authentication requirement extraction (flagged for project/endpoint auth)
        const opSecurity = Array.isArray(op.security) ? op.security : docSecurity;
        if (opSecurity.length > 0) {
          if (!op.tags) op.tags = [];
          if (!op.tags.includes('authenticated')) {
            op.tags.push('authenticated');
          }
        }

        // Request Body & Schema Extraction
        let body: string | undefined;
        let bodySchema: any;
        let contentType = 'application/json';

        // OpenAPI 3.x requestBody
        if (op.requestBody?.content) {
          const contentTypes = Object.keys(op.requestBody.content);
          const jsonType = contentTypes.find(t => t.includes('json')) || contentTypes[0];
          if (jsonType) {
            contentType = jsonType;
            const cObj = op.requestBody.content[jsonType];
            bodySchema = cObj.schema;
            if (cObj.example !== undefined) {
              body = typeof cObj.example === 'string' ? cObj.example : JSON.stringify(cObj.example, null, 2);
            } else if (cObj.examples && Object.keys(cObj.examples).length > 0) {
              const firstEx = Object.values(cObj.examples)[0] as any;
              const val = firstEx?.value !== undefined ? firstEx.value : firstEx;
              body = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
            } else if (bodySchema) {
              const generated = generatePayloadFromSchema(bodySchema);
              body = JSON.stringify(generated, null, 2);
            }
          }
        }

        // Swagger 2.0 body parameter
        if (!body) {
          const bodyParam = combinedParams.find(p => p.in === 'body');
          if (bodyParam) {
            bodySchema = bodyParam.schema;
            if (bodyParam['x-example'] !== undefined) {
              body = typeof bodyParam['x-example'] === 'string' ? bodyParam['x-example'] : JSON.stringify(bodyParam['x-example'], null, 2);
            } else if (bodySchema) {
              const generated = generatePayloadFromSchema(bodySchema);
              body = JSON.stringify(generated, null, 2);
            }
          }
        }

        // Responses extraction
        const responseCodes: number[] = [];
        if (op.responses && typeof op.responses === 'object') {
          for (const key of Object.keys(op.responses)) {
            const parsed = parseInt(key, 10);
            if (!isNaN(parsed) && parsed >= 100 && parsed < 600) {
              responseCodes.push(parsed);
            }
          }
        }

        let expectedStatus = 200;
        if (upperMethod === 'POST') {
          expectedStatus = responseCodes.includes(201) ? 201 : responseCodes.find(c => c >= 200 && c < 300) || 200;
        } else if (upperMethod === 'DELETE') {
          expectedStatus = responseCodes.includes(204) ? 204 : responseCodes.find(c => c >= 200 && c < 300) || 200;
        } else {
          expectedStatus = responseCodes.find(c => c >= 200 && c < 300) || 200;
        }

        const hasSchema = Boolean(
          bodySchema ||
          op?.responses?.['200']?.content?.['application/json']?.schema ||
          op?.responses?.['201']?.content?.['application/json']?.schema ||
          op?.responses?.['200']?.schema
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
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          body,
          contentType,
          expectedStatus,
          expectedStatuses: responseCodes.length > 0 ? responseCodes : [expectedStatus],
          pathParams: Object.keys(pathParams).length > 0 ? pathParams : undefined,
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
          bodySchema,
          tags: Array.isArray(op.tags) ? op.tags : undefined,
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

      // Headers extraction
      const headers: Record<string, string> = {};
      if (Array.isArray(req.header)) {
        for (const h of req.header) {
          if (h && h.key && !h.disabled) {
            headers[h.key] = h.value || '';
          }
        }
      }

      // Body extraction
      let body: string | undefined;
      let contentType = 'application/json';
      if (req.body) {
        if (req.body.mode === 'raw' && req.body.raw) {
          body = req.body.raw;
        } else if (req.body.mode === 'urlencoded' && Array.isArray(req.body.urlencoded)) {
          contentType = 'application/x-www-form-urlencoded';
          const kv: Record<string, string> = {};
          for (const u of req.body.urlencoded) {
            if (u.key && !u.disabled) kv[u.key] = u.value || '';
          }
          body = JSON.stringify(kv, null, 2);
        }
      }

      const existing = existingEndpoints.find(
        e => e.path === extractedPath && e.method === method
      );

      const action: 'create' | 'update' | 'noop' = existing ? 'update' : 'create';
      if (action === 'create') createCount++;
      else updateCount++;

      previews.push({
        method,
        path: extractedPath,
        operationId: `pm_${method.toLowerCase()}_${extractedPath.replace(/[^a-zA-Z0-9]/g, '_')}`,
        summary: reqItem.name || `${method} ${extractedPath}`,
        responseSchemaAvailable: false,
        action,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body,
        contentType,
        expectedStatus: method === 'POST' ? 201 : 200,
        expectedStatuses: [method === 'POST' ? 201 : 200],
      });
    }

    return {
      format: 'postman' as const,
      title: collection.info?.name || 'Postman Collection Import',
      version: '1.0.0',
      suggestedBaseUrl: detectedOrigin,
      totalOperations: previews.length,
      createCount,
      updateCount,
      deactivateCount: 0,
      endpoints: previews,
    };
  },

  // 3. cURL Command Parser
  parseCurlCommands: (curlText: string, existingEndpoints: Endpoint[]) => {
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;
    let detectedOrigin: string | undefined;

    const commands = curlText.split(/(?=curl\s+)/i).filter(c => c.trim().toLowerCase().startsWith('curl'));

    for (const cmd of commands) {
      const methodMatch = cmd.match(/-X\s+([A-Za-z]+)/i) || cmd.match(/--request\s+([A-Za-z]+)/i);
      let method = (methodMatch ? methodMatch[1].toUpperCase() : 'GET') as HttpMethod;

      if (cmd.includes('-d ') || cmd.includes('--data') || cmd.includes('--data-raw')) {
        if (!methodMatch) method = 'POST';
      }

      if (!VALID_METHODS.includes(method)) method = 'GET';

      const urlMatch = cmd.match(/(?:'|")?(https?:\/\/[^\s'"\\]+)(?:'|")?/i) ||
                       cmd.match(/(?:curl\s+)(?:'|")?([^\s'"\\]+)(?:'|")?/i);
      if (!urlMatch) continue;

      const rawUrl = urlMatch[1];
      let path = '/';

      try {
        if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
          const parsed = new URL(rawUrl);
          path = parsed.pathname || '/';
          if (!detectedOrigin) {
            detectedOrigin = parsed.origin;
          }
        } else {
          path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
        }
      } catch {
        path = rawUrl.replace(/^https?:\/\/[^\/]+/, '') || '/';
      }

      // Headers extraction
      const headers: Record<string, string> = {};
      const headerMatches = cmd.matchAll(/-H\s+['"]([^'"]+)['"]/gi);
      for (const hm of headerMatches) {
        const parts = hm[1].split(':');
        if (parts.length >= 2) {
          headers[parts[0].trim()] = parts.slice(1).join(':').trim();
        }
      }

      // Data extraction
      let body: string | undefined;
      const dataMatch = cmd.match(/(?:--data|--data-raw|-d)\s+['"]([^'"]+)['"]/i);
      if (dataMatch) {
        body = dataMatch[1];
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
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body,
        expectedStatus: method === 'POST' ? 201 : 200,
        expectedStatuses: [method === 'POST' ? 201 : 200],
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

  // 4. Batch Route List Parser
  parseRouteList: (text: string, existingEndpoints: Endpoint[]) => {
    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;
    let detectedOrigin: string | undefined;

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));

    for (const line of lines) {
      const match = line.match(/^([A-Za-z]+)?\s*(\S+)(?:\s*[-–:]\s*(.+))?$/);
      if (!match) continue;

      let rawMethod = match[1]?.toUpperCase() || 'GET';
      let rawTarget = match[2];
      let summary = match[3] || '';

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
        expectedStatus: method === 'POST' ? 201 : 200,
        expectedStatuses: [method === 'POST' ? 201 : 200],
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
    let detectedOrigin: string | undefined;

    if (input.url) {
      try {
        const live = await openapiService.resolveLiveUrl(input.url);
        content = live.content;
        detectedOrigin = live.detectedBaseUrl;
      } catch (err: any) {
        throw new Error(`Failed to fetch API specification from "${input.url}": ${err.message}`);
      }
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
        // Fallback
      }
    }

    if (targetFormat === 'openapi') {
      try {
        const doc = openapiService.parseSpec(content);
        if (doc && (doc.openapi || doc.swagger || doc.paths)) {
          return openapiService.parseOpenApiSpec(doc, existingEndpoints, detectedOrigin);
        }
      } catch {
        // Fallback
      }
    }

    // Default fallback: parse as route list
    return openapiService.parseRouteList(content, existingEndpoints);
  },

  // Apply Import to Project
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
      const cleanBase = healthService.cleanBaseUrl(newProjectData.baseUrl);
      const createdProj: Project = {
        id: newProjId,
        name: newProjectData.name.trim(),
        description: newProjectData.description?.trim() || '',
        baseUrl: cleanBase,
        environment: newProjectData.environment || 'production',
        status: 'active',
        endpointCount: 0,
        healthScore: 100,
        tags: newProjectData.tags || ['imported'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bearerToken: newProjectData.bearerToken?.trim() || undefined,
        apiKey: newProjectData.apiKey?.trim() || undefined,
        apiKeyHeader: newProjectData.apiKeyHeader?.trim() || undefined,
        headers: newProjectData.headers,
      };
      project = createdProj;
      db.projects.unshift(createdProj);

      // Persist new project to SQLite & Postgres
      if (sqliteService.isConnected) {
        try {
          sqliteService.execute(
            'INSERT OR REPLACE INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, user_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [createdProj.id, createdProj.name, createdProj.description || '', createdProj.status, createdProj.baseUrl, createdProj.environment, createdProj.endpointCount, createdProj.healthScore || 100, null, null, createdProj.createdAt, createdProj.updatedAt]
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

      const expectedStatus = item.expectedStatus || (item.method === 'POST' ? 201 : 200);
      const expectedStatuses = item.expectedStatuses || [expectedStatus];

      if (existing) {
        existing.name = item.summary || item.operationId || existing.name;
        if (item.headers) existing.headers = { ...existing.headers, ...item.headers };
        if (item.body) existing.body = item.body;
        if (item.contentType) existing.contentType = item.contentType;
        if (item.expectedStatus) existing.expectedStatus = item.expectedStatus;
        if (item.expectedStatuses) existing.expectedStatuses = item.expectedStatuses;
        if (item.pathParams) existing.pathParams = item.pathParams;
        if (item.queryParams) existing.queryParams = item.queryParams;
        if (item.bodySchema) existing.bodySchema = item.bodySchema;

        if (sqliteService.isConnected) {
          try {
            sqliteService.execute(
              'UPDATE endpoints SET name = ?, expected_status = ? WHERE id = ?',
              [existing.name, existing.expectedStatus, existing.id]
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
          expectedStatus,
          expectedStatuses,
          timeout: 5000,
          headers: item.headers || {},
          body: item.body,
          contentType: item.contentType || 'application/json',
          pathParams: item.pathParams,
          queryParams: item.queryParams,
          bodySchema: item.bodySchema,
          responseTimeP50: 60,
          responseTimeP95: 140,
          responseTimeP99: 220,
          uptime: 100,
          requestsPerMin: 20,
          errorRate: 0,
          healthScore: 100,
          latencyThresholdMs: 500,
          lastChecked: new Date().toISOString(),
          tags: ['imported', ...(item.tags || [])],
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
