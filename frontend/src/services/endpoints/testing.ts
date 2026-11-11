import api from '@/services/api';
import type { TestCase, TestResult, PaginatedResponse } from '@/types';

export const testingService = {
  listTestCases: (endpointId?: string) =>
    api.get<PaginatedResponse<TestCase>>('/testing/cases', {
      params: endpointId ? { endpointId } : undefined,
    }).then(r => r.data),

  createTestCase: (data: Omit<TestCase, 'id' | 'lastRunAt' | 'lastStatus'>) =>
    api.post<TestCase>('/testing/cases', data).then(r => r.data),

  updateTestCase: (id: string, data: Partial<TestCase>) =>
    api.patch<TestCase>(`/testing/cases/${id}`, data).then(r => r.data),

  deleteTestCase: (id: string) =>
    api.delete(`/testing/cases/${id}`).then(r => r.data),

  runTest: (id: string) =>
    api.post<TestResult>(`/testing/cases/${id}/run`).then(r => r.data),

  runAll: (endpointId?: string) =>
    api.post<TestResult[]>('/testing/run-all', { endpointId }).then(r => r.data),

  getResults: (testCaseId: string) =>
    api.get<TestResult[]>(`/testing/cases/${testCaseId}/results`).then(r => r.data),
};
