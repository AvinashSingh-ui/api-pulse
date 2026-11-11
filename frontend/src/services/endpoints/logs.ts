import api from '@/services/api';
import type { RequestLog, PaginatedResponse, TableParams } from '@/types';

export interface LogsParams extends Partial<TableParams> {
  projectId?: string;
  endpointId?: string;
  statusCode?: number;
  method?: string;
  from?: string;
  to?: string;
  search?: string;
}

export const logsService = {
  list: (params?: LogsParams) =>
    api.get<PaginatedResponse<RequestLog>>('/logs', { params }).then(r => r.data),

  get: (id: string) =>
    api.get<RequestLog>(`/logs/${id}`).then(r => r.data),

  export: (params?: LogsParams) =>
    api.get('/logs/export', { params, responseType: 'blob' }).then(r => r.data),
};
