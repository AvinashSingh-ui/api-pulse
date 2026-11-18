import api from 'api';
import type { HttpMethod, Project } from '@/types';

export interface ParsedEndpointPreview {
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  responseSchemaAvailable?: boolean;
  action: 'create' | 'update' | 'noop';
}

export interface ImportPreviewResult {
  format: 'openapi' | 'postman' | 'curl' | 'routes';
  title: string;
  version: string;
  suggestedBaseUrl?: string;
  totalOperations: number;
  createCount: number;
  updateCount: number;
  endpoints: ParsedEndpointPreview[];
}

export interface ImportApplyPayload {
  projectId?: string;
  endpoints: ParsedEndpointPreview[];
  newProjectData?: {
    name: string;
    baseUrl: string;
    environment?: 'production' | 'staging' | 'development';
    description?: string;
    tags?: string[];
  };
}

export interface ImportApplyResponse {
  message: string;
  project?: Project;
  addedCount: number;
  updatedCount: number;
  totalEndpoints: number;
}

export const openapiService = {
  preview: async (payload: {
    rawContent?: string;
    url?: string;
    projectId?: string;
    format?: string;
  }): Promise<ImportPreviewResult> => {
    const res = await api.post<ImportPreviewResult>('/openapi/preview', payload);
    return res.data;
  },

  importSpec: async (payload: ImportApplyPayload): Promise<ImportApplyResponse> => {
    const res = await api.post<ImportApplyResponse>('/openapi/import', payload);
    return res.data;
  },
};
