import api from '@/services/api';
import type { Alert, AlertRule, PaginatedResponse, TableParams } from '@/types';

export const alertsService = {
  listAlerts: (params?: Partial<TableParams> & { status?: string; severity?: string; projectId?: string; pageSize?: number }) =>
    api.get<PaginatedResponse<Alert>>('/alerts', { params }).then(r => r.data),

  list: (params?: Partial<TableParams> & { status?: string; severity?: string; projectId?: string; pageSize?: number }) =>
    api.get<PaginatedResponse<Alert>>('/alerts', { params }).then(r => r.data),

  acknowledgeAlert: (id: string) =>
    api.post<Alert>(`/alerts/${id}/acknowledge`).then(r => r.data),

  acknowledge: (id: string) =>
    api.post<Alert>(`/alerts/${id}/acknowledge`).then(r => r.data),

  resolveAlert: (id: string) =>
    api.post<Alert>(`/alerts/${id}/resolve`).then(r => r.data),

  resolve: (id: string) =>
    api.post<Alert>(`/alerts/${id}/resolve`).then(r => r.data),

  listRules: (params?: Partial<TableParams> & { projectId?: string }) =>
    api.get<PaginatedResponse<AlertRule>>('/alerts/rules', { params }).then(r => r.data),

  createRule: (data: Omit<AlertRule, 'id' | 'createdAt'>) =>
    api.post<AlertRule>('/alerts/rules', data).then(r => r.data),

  updateRule: (id: string, data: Partial<AlertRule>) =>
    api.patch<AlertRule>(`/alerts/rules/${id}`, data).then(r => r.data),

  deleteRule: (id: string) =>
    api.delete(`/alerts/rules/${id}`).then(r => r.data),

  toggleRule: (id: string, enabled: boolean) =>
    api.patch<AlertRule>(`/alerts/rules/${id}`, { isEnabled: enabled }).then(r => r.data),
};
