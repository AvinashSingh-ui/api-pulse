import api from '@/services/api';
import type { AIInsight } from '@/types';

export const aiService = {
  getInsights: (params?: { projectId?: string; endpointId?: string; type?: string }) =>
    api.get<AIInsight[]>('/ai/insights', { params }).then(r => r.data),

  analyzeEndpoint: (endpointId: string) =>
    api.post<AIInsight[]>(`/ai/analyze/endpoint/${endpointId}`).then(r => r.data),

  analyzeProject: (projectId: string) =>
    api.post<AIInsight[]>(`/ai/analyze/project/${projectId}`).then(r => r.data),

  chat: (message: string, context?: Record<string, unknown>) =>
    api.post<{ response: string; insights?: AIInsight[] }>('/ai/chat', { message, context }).then(r => r.data),
};
