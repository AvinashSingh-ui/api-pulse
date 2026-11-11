import YAML from 'yaml';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import type { Endpoint, HttpMethod } from '../../types/index.js';

export interface ParsedEndpointPreview {
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  responseSchemaAvailable: boolean;
  action: 'create' | 'update' | 'noop';
}

export const openapiService = {
  parseSpec: (rawContent: string): any => {
    try {
      return JSON.parse(rawContent);
    } catch {
      return YAML.parse(rawContent);
    }
  },

  previewSpec: async (input: { rawContent?: string; url?: string; projectId: string }) => {
    let specText = input.rawContent || '';
    if (input.url) {
      const res = await axios.get(input.url, { timeout: 8000 });
      specText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }

    if (!specText) {
      throw new Error('No OpenAPI specification content or URL provided');
    }

    const doc = openapiService.parseSpec(specText);
    const paths = doc.paths || {};
    const existingEndpoints = db.endpoints.filter(e => e.projectId === input.projectId);

    const previews: ParsedEndpointPreview[] = [];
    let createCount = 0;
    let updateCount = 0;

    const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    for (const [pathKey, pathItem] of Object.entries(paths as Record<string, any>)) {
      for (const [methodKey, rawOp] of Object.entries((pathItem || {}) as Record<string, any>)) {
        const op = rawOp as any;
        const upperMethod = methodKey.toUpperCase() as HttpMethod;
        if (!validMethods.includes(upperMethod)) continue;

        const existing = existingEndpoints.find(
          e => e.path === pathKey && e.method === upperMethod
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
          path: pathKey,
          operationId: op?.operationId || op?.summary || `${upperMethod} ${pathKey}`,
          summary: op?.summary || op?.description || '',
          responseSchemaAvailable: hasSchema,
          action,
        });
      }
    }

    return {
      title: doc.info?.title || 'OpenAPI Import',
      version: doc.info?.version || '1.0.0',
      totalOperations: previews.length,
      createCount,
      updateCount,
      deactivateCount: 0,
      endpoints: previews,
      rawDoc: doc,
    };
  },

  applyImport: async (projectId: string, endpointsToApply: ParsedEndpointPreview[]) => {
    const project = db.projects.find(p => p.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    let addedCount = 0;
    let updatedCount = 0;

    for (const item of endpointsToApply) {
      const existing = db.endpoints.find(
        e => e.projectId === projectId && e.path === item.path && e.method === item.method
      );

      if (existing) {
        existing.name = item.summary || item.operationId || existing.name;
        updatedCount++;
      } else {
        const newEp: Endpoint = {
          id: `e_${uuidv4().slice(0, 8)}`,
          projectId,
          name: item.summary || item.operationId || `${item.method} ${item.path}`,
          path: item.path,
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
          lastChecked: new Date().toISOString(),
          tags: ['openapi-imported'],
        };
        db.endpoints.push(newEp);
        addedCount++;
      }
    }

    project.endpointCount = db.endpoints.filter(e => e.projectId === projectId).length;
    project.updatedAt = new Date().toISOString();
    db.save();

    return {
      message: `Successfully synchronized OpenAPI spec: ${addedCount} created, ${updatedCount} updated`,
      addedCount,
      updatedCount,
      totalEndpoints: project.endpointCount,
    };
  },
};
