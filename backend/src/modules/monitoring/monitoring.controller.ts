import { Request, Response } from 'express';
import { db } from '../../db/store.js';
import type { DashboardStats, MetricPoint, UptimeRecord } from '../../types/index.js';

function generateTimeSeriesPoints(count: number, base: number, variance: number): MetricPoint[] {
  if (base <= 0) return [];
  const points: MetricPoint[] = [];
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    points.push({
      timestamp: new Date(now - i * 3600_000).toISOString(),
      value: Math.max(0, Math.round(base + (Math.random() - 0.5) * variance * 2)),
    });
  }
  return points;
}

export const monitoringController = {
  getDashboardStats: (_req: Request, res: Response) => {
    // 1. Identify active, non-deleted projects only
    const activeProjects = db.projects.filter(p => p.status === 'active' && !p.deletedAt);
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const totalProjects = activeProjects.length;

    // 2. Identify active endpoints belonging to active projects
    const activeEndpoints = db.endpoints.filter(
      e => activeProjectIds.has(e.projectId) && e.status !== 'paused'
    );
    const activeEndpointIds = new Set(activeEndpoints.map(e => e.id));
    const totalEndpoints = activeEndpoints.length;

    const healthyEndpoints = activeEndpoints.filter(e => e.status === 'healthy').length;
    const degradedEndpoints = activeEndpoints.filter(e => e.status === 'degraded').length;
    const downEndpoints = activeEndpoints.filter(e => e.status === 'down').length;

    // 3. Identify active alerts belonging exclusively to active projects and active endpoints
    const activeAlertsList = db.alerts.filter(
      a =>
        a.status === 'active' &&
        activeProjectIds.has(a.projectId) &&
        (!a.endpointId || activeEndpointIds.has(a.endpointId))
    );
    const activeAlerts = activeAlertsList.length;

    // 4. Identify request logs belonging to active projects
    const activeLogs = db.logs.filter(
      l =>
        (l.projectId && activeProjectIds.has(l.projectId)) ||
        (l.endpointId && activeEndpointIds.has(l.endpointId))
    );

    // 5. Calculate real metrics from active records only
    const avgResponseTime = totalEndpoints > 0
      ? Math.round(activeEndpoints.reduce((acc, e) => acc + (e.responseTimeP50 || 0), 0) / totalEndpoints)
      : 0;

    const avgUptime = totalEndpoints > 0
      ? Number((activeEndpoints.reduce((acc, e) => acc + (e.uptime ?? 100), 0) / totalEndpoints).toFixed(2))
      : 0;

    const avgHealthScore = totalEndpoints > 0
      ? Math.round(activeEndpoints.reduce((acc, e) => acc + (e.healthScore ?? 100), 0) / totalEndpoints)
      : 0;

    const avgAvailability = totalEndpoints > 0
      ? Number(((healthyEndpoints / totalEndpoints) * 100).toFixed(1))
      : 0;

    const errorCount = activeLogs.filter(l => l.statusCode >= 400).length;
    const errorRateToday = activeLogs.length > 0
      ? Number(((errorCount / activeLogs.length) * 100).toFixed(2))
      : 0;

    // Endpoints needing attention (degraded or down or error rate > 1%)
    const needingAttention = activeEndpoints
      .filter(e => e.status === 'down' || e.status === 'degraded' || e.errorRate > 1)
      .map(e => ({
        endpointId: e.id,
        name: e.name,
        path: e.path,
        method: e.method,
        status: e.status,
        p95: e.responseTimeP95,
        uptime: e.uptime,
      }));

    // Recent activity feed from real logs
    const recentActivity = activeLogs.slice(0, 10).map(log => {
      const ep = activeEndpoints.find(e => e.id === log.endpointId);
      return {
        id: log.id,
        time: log.timestamp,
        endpointName: ep ? `${ep.method} ${ep.path}` : `${log.method} ${log.path}`,
        status: (log.statusCode < 400 ? 'pass' : 'fail') as 'pass' | 'fail',
        failureType: log.failureType || (log.statusCode < 400 ? 'None' : 'Error'),
        duration: log.responseTime,
      };
    });

    const stats: DashboardStats = {
      totalProjects,
      totalEndpoints,
      avgHealthScore,
      avgAvailability,
      avgUptime,
      avgResponseTime,
      activeAlerts,
      requestsToday: activeLogs.length,
      errorRateToday,
      healthyEndpoints,
      degradedEndpoints,
      downEndpoints,
      needingAttention,
      recentActivity,
    };

    return res.json(stats);
  },

  getEndpointMetrics: (req: Request, res: Response) => {
    const { id } = req.params;
    const endpoint = db.endpoints.find(e => e.id === id);
    if (!endpoint) {
      return res.status(404).json({ message: `Endpoint with ID ${id} not found` });
    }

    const responseTime = generateTimeSeriesPoints(24, endpoint.responseTimeP50, 15);
    const requestVolume = generateTimeSeriesPoints(24, endpoint.requestsPerMin, 10);
    const errorRate = generateTimeSeriesPoints(24, endpoint.errorRate, 0.2);
    const uptime = generateTimeSeriesPoints(24, endpoint.uptime, 0.1);

    return res.json({
      endpointId: endpoint.id,
      responseTime,
      requestVolume,
      errorRate,
      uptime,
    });
  },

  getUptimeHistory: (req: Request, res: Response) => {
    const days = parseInt((req.query.days as string) || '90', 10);
    const records: UptimeRecord[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400_000);
      records.push({
        date: d.toISOString().split('T')[0],
        status: 'up',
        uptime: 100,
        incidents: 0,
      });
    }

    return res.json(records);
  },

  getResponseTimeHistory: (req: Request, res: Response) => {
    const { id } = req.params;
    const endpoint = db.endpoints.find(e => e.id === id);
    const base = endpoint ? endpoint.responseTimeP50 : 0;
    const points = generateTimeSeriesPoints(24, base, 10);
    return res.json(points);
  },

  getOverviewTimeseries: (_req: Request, res: Response) => {
    const activeProjects = db.projects.filter(p => p.status === 'active' && !p.deletedAt);
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const activeEndpoints = db.endpoints.filter(
      e => activeProjectIds.has(e.projectId) && e.status !== 'paused'
    );
    const activeLogs = db.logs.filter(
      l => l.projectId && activeProjectIds.has(l.projectId)
    );

    // If there are zero active endpoints, return empty timeseries so charts show clean empty states
    if (activeEndpoints.length === 0) {
      return res.json({
        responseTime: [],
        requestVolume: [],
        errorRate: [],
      });
    }

    const baseRt = Math.round(
      activeEndpoints.reduce((acc, e) => acc + (e.responseTimeP50 || 0), 0) / activeEndpoints.length
    );

    return res.json({
      responseTime: generateTimeSeriesPoints(24, baseRt, 10),
      requestVolume: generateTimeSeriesPoints(24, Math.max(activeLogs.length, 1), 5),
      errorRate: generateTimeSeriesPoints(24, 0, 0),
    });
  },
};
