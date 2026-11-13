import api from '@/services/api';
import type { Project, PaginatedResponse, TableParams } from '@/types';

export interface ProjectListParams extends Partial<TableParams> {
  status?: string;
  search?: string;
  tab?: 'active' | 'history';
  environment?: string;
}

export const projectsService = {
  list: (params?: ProjectListParams) =>
    api.get<PaginatedResponse<Project>>('/projects', { params }).then(r => r.data),

  get: (id: string) =>
    api.get<Project>(`/projects/${id}`).then(r => r.data),

  create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'endpointCount' | 'healthScore'>) =>
    api.post<Project>('/projects', data).then(r => r.data),

  update: (id: string, data: Partial<Project>) =>
    api.patch<Project>(`/projects/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete<{ message: string; project?: Project }>(`/projects/${id}`).then(r => r.data),

  restore: (id: string) =>
    api.post<{ message: string; project: Project }>(`/projects/${id}/restore`).then(r => r.data),

  permanentDelete: (id: string) =>
    api.delete<{ message: string }>(`/projects/${id}/permanent`).then(r => r.data),
};
