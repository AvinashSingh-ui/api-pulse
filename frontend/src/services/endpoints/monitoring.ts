import api from '@/services/api';
import type { MonitoringData, UptimeRecord, DashboardStats, MetricPoint } from '@/types';

export interface MonitoringParams {
  from?: string;
  to?: string;
  interval?: '1m' | '5m' | '15m' | '1h' | '6h' | '24h';
}

export const monitoringService = {
  getDashboardStats: () =>
    api.get<DashboardStats>('/monitoring/stats').then(r => r.data),

  getEndpointMetrics: (endpointId: string, params?: MonitoringParams) =>
    api.get<MonitoringData>(`/monitoring/endpoints/${endpointId}`, { params }).then(r => r.data),

  getUptimeHistory: (endpointId: string, days = 90) =>
    api.get<UptimeRecord[]>(`/monitoring/endpoints/${endpointId}/uptime`, {
      params: { days },
    }).then(r => r.data),

  getResponseTimeHistory: (endpointId: string, params?: MonitoringParams) =>
    api.get<MetricPoint[]>(`/monitoring/endpoints/${endpointId}/response-time`, { params }).then(r => r.data),

  getOverviewTimeseries: (params?: MonitoringParams) =>
    api.get<{ responseTime: MetricPoint[]; requestVolume: MetricPoint[]; errorRate: MetricPoint[] }>(
      '/monitoring/overview', { params }
    ).then(r => r.data),
};
