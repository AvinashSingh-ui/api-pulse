import api from '@/services/api';
import type { Endpoint, PaginatedResponse, TableParams, Alert, AIInsight } from '@/types';

export const endpointsService = {
  list: (params?: Partial<TableParams> & { projectId?: string; method?: string; status?: string; search?: string }) =>
    api.get<PaginatedResponse<Endpoint>>('/endpoints', { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Endpoint>(`/endpoints/${id}`).then(r => r.data),

  create: (data: Omit<Endpoint, 'id' | 'status' | 'responseTimeP50' | 'responseTimeP95' | 'responseTimeP99' | 'uptime' | 'requestsPerMin' | 'errorRate' | 'lastChecked'>) =>
    api.post<Endpoint>('/endpoints', data).then(r => r.data),

  update: (id: string, data: Partial<Endpoint>) =>
    api.patch<Endpoint>(`/endpoints/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/endpoints/${id}`).then(r => r.data),

  checkNow: (id: string) =>
    api.post<{
      status: string;
      responseTime: number;
      statusCode?: number;
      failureType?: string;
      error?: string;
      alert?: Alert;
      aiInsight?: AIInsight;
    }>(`/endpoints/${id}/check`).then(r => r.data),
};
