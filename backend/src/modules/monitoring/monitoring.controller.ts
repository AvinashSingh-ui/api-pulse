import { Request, Response } from 'express';
import { db } from '../../db/store.js';
import type { DashboardStats, MetricPoint, UptimeRecord } from '../../types/index.js';

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

    const recoveredEndpoints = db.notifications.filter(
      n => n.type === 'recovered' && (!n.projectId || activeProjectIds.has(n.projectId))
    ).length;

    const recentNotifications = db.notifications
      .filter(n => !n.projectId || activeProjectIds.has(n.projectId))
      .slice(0, 10);

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
      recoveredEndpoints,
      recentNotifications,
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

    const endpointLogs = db.logs.filter(l => l.endpointId === id);
    if (endpointLogs.length === 0) {
      return res.json({
        endpointId: endpoint.id,
        responseTime: [],
        requestVolume: [],
        errorRate: [],
        uptime: [],
      });
    }

    const sortedLogs = [...endpointLogs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const responseTime: MetricPoint[] = sortedLogs.slice(-50).map(l => ({
      timestamp: l.timestamp,
      value: l.responseTime,
    }));

    const bucketMap = new Map<string, { total: number; errors: number }>();
    sortedLogs.forEach(l => {
      const bucketKey = new Date(l.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
      const entry = bucketMap.get(bucketKey) || { total: 0, errors: 0 };
      entry.total += 1;
      if (l.statusCode >= 400) entry.errors += 1;
      bucketMap.set(bucketKey, entry);
    });

    const requestVolume: MetricPoint[] = [];
    const errorRate: MetricPoint[] = [];
    const uptime: MetricPoint[] = [];

    bucketMap.forEach((stats, timestamp) => {
      requestVolume.push({ timestamp, value: stats.total });
      errorRate.push({ timestamp, value: Number(((stats.errors / stats.total) * 100).toFixed(2)) });
      uptime.push({ timestamp, value: Number((((stats.total - stats.errors) / stats.total) * 100).toFixed(2)) });
    });

    return res.json({
      endpointId: endpoint.id,
      responseTime,
      requestVolume,
      errorRate,
      uptime,
    });
  },

  getUptimeHistory: (req: Request, res: Response) => {
    const { id } = req.params;
    const days = parseInt((req.query.days as string) || '90', 10);
    const endpointLogs = id ? db.logs.filter(l => l.endpointId === id) : db.logs;
    const records: UptimeRecord[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400_000);
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = endpointLogs.filter(l => l.timestamp.startsWith(dateStr));

      if (dayLogs.length === 0) {
        records.push({
          date: dateStr,
          status: 'up',
          uptime: 100,
          incidents: 0,
        });
      } else {
        const errors = dayLogs.filter(l => l.statusCode >= 400).length;
        const dayUptime = Number((((dayLogs.length - errors) / dayLogs.length) * 100).toFixed(2));
        const status = dayUptime >= 99 ? 'up' : dayUptime >= 95 ? 'degraded' : 'down';
        records.push({
          date: dateStr,
          status,
          uptime: dayUptime,
          incidents: errors,
        });
      }
    }

    return res.json(records);
  },

  getResponseTimeHistory: (req: Request, res: Response) => {
    const { id } = req.params;
    const endpointLogs = db.logs
      .filter(l => l.endpointId === id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-50);

    const points: MetricPoint[] = endpointLogs.map(l => ({
      timestamp: l.timestamp,
      value: l.responseTime,
    }));

    return res.json(points);
  },

  getOverviewTimeseries: (_req: Request, res: Response) => {
    const activeProjects = db.projects.filter(p => p.status === 'active' && !p.deletedAt);
    const activeProjectIds = new Set(activeProjects.map(p => p.id));
    const activeEndpoints = db.endpoints.filter(
      e => activeProjectIds.has(e.projectId) && e.status !== 'paused'
    );
    const activeEndpointIds = new Set(activeEndpoints.map(e => e.id));
    const activeLogs = db.logs.filter(
      l =>
        (l.projectId && activeProjectIds.has(l.projectId)) ||
        (l.endpointId && activeEndpointIds.has(l.endpointId))
    );

    if (activeLogs.length === 0) {
      return res.json({
        responseTime: [],
        requestVolume: [],
        errorRate: [],
      });
    }

    const bucketMap = new Map<string, { total: number; errors: number; totalRt: number }>();
    activeLogs
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(l => {
        const bucketKey = new Date(l.timestamp).toISOString().slice(0, 13) + ':00:00.000Z';
        const entry = bucketMap.get(bucketKey) || { total: 0, errors: 0, totalRt: 0 };
        entry.total += 1;
        if (l.statusCode >= 400) entry.errors += 1;
        entry.totalRt += l.responseTime;
        bucketMap.set(bucketKey, entry);
      });

    const responseTime: MetricPoint[] = [];
    const requestVolume: MetricPoint[] = [];
    const errorRate: MetricPoint[] = [];

    bucketMap.forEach((stats, timestamp) => {
      responseTime.push({ timestamp, value: Math.round(stats.totalRt / stats.total) });
      requestVolume.push({ timestamp, value: stats.total });
      errorRate.push({ timestamp, value: Number(((stats.errors / stats.total) * 100).toFixed(2)) });
    });

    return res.json({
      responseTime,
      requestVolume,
      errorRate,
    });
  },
};
