import api from '@/services/api';
import type { Project, PaginatedResponse, TableParams } from '@/types';

export const projectsService = {
  list: (params?: Partial<TableParams> & { status?: string; search?: string }) =>
    api.get<PaginatedResponse<Project>>('/projects', { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Project>(`/projects/${id}`).then(r => r.data),

  create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'endpointCount' | 'healthScore'>) =>
    api.post<Project>('/projects', data).then(r => r.data),

  update: (id: string, data: Partial<Project>) =>
    api.patch<Project>(`/projects/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/projects/${id}`).then(r => r.data),
};
