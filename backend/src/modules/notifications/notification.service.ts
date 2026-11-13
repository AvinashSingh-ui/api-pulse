import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { AppNotification, Endpoint, EndpointStatus, NotificationSeverity, NotificationType } from '../../types/index.js';

export const notificationService = {
  /**
   * Create and persist a new notification with deduplication for ongoing incidents.
   */
  createNotification(params: {
    projectId?: string;
    endpointId?: string;
    title: string;
    message: string;
    severity: NotificationSeverity;
    type: NotificationType;
    metadata?: AppNotification['metadata'];
  }): AppNotification | null {
    const { projectId, endpointId, title, message, severity, type, metadata = {} } = params;

    // Look up project and endpoint details for context
    const project = projectId ? db.projects.find(p => p.id === projectId) : (endpointId ? db.projects.find(p => p.id === db.endpoints.find(e => e.id === endpointId)?.projectId) : undefined);
    const endpoint = endpointId ? db.endpoints.find(e => e.id === endpointId) : undefined;

    // Deduplication rule for ongoing incidents:
    // If there is an active unread notification of the same type for this endpoint created recently (last 15 mins), do not duplicate!
    if (endpointId && (type === 'degraded' || type === 'unhealthy' || type === 'latency_spike')) {
      const fifteenMinsAgo = Date.now() - 15 * 60 * 1000;
      const existing = db.notifications.find(
        n => n.endpointId === endpointId &&
             n.type === type &&
             !n.isRead &&
             new Date(n.createdAt).getTime() > fifteenMinsAgo
      );
      if (existing) {
        // Prevent duplicate alerts for the same ongoing incident
        return null;
      }
    }

    const notification: AppNotification = {
      id: `notif_${uuidv4().slice(0, 8)}`,
      projectId: project?.id || projectId,
      projectName: project?.name,
      endpointId: endpoint?.id || endpointId,
      endpointName: endpoint?.name,
      endpointPath: endpoint?.path,
      method: endpoint?.method,
      title,
      message,
      severity,
      type,
      isRead: false,
      createdAt: new Date().toISOString(),
      metadata,
    };

    // Save to memory store
    db.notifications.unshift(notification);
    if (db.notifications.length > 500) db.notifications.pop();

    // Persist to SQLite
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT INTO notifications (id, project_id, endpoint_id, title, message, severity, type, is_read, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            notification.id,
            notification.projectId || null,
            notification.endpointId || null,
            notification.title,
            notification.message,
            notification.severity,
            notification.type,
            notification.isRead ? 1 : 0,
            JSON.stringify(notification.metadata || {}),
            notification.createdAt,
          ]
        );
      } catch (err: any) {
        console.warn('[Notifications] SQLite insert error:', err.message);
      }
    }

    // Persist to PostgreSQL if connected
    if (postgresService.isConnected) {
      try {
        postgresService.query(
          'INSERT INTO notifications (id, project_id, endpoint_id, title, message, severity, type, is_read, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [
            notification.id,
            notification.projectId || null,
            notification.endpointId || null,
            notification.title,
            notification.message,
            notification.severity,
            notification.type,
            notification.isRead,
            notification.metadata || {},
            notification.createdAt,
          ]
        ).catch(() => {});
      } catch {}
    }

    db.save();
    return notification;
  },

  /**
   * Evaluate health status transition and trigger intelligent notification:
   * - Healthy -> Degraded: Warning notification
   * - Degraded / Healthy -> Down / Unhealthy: Critical notification
   * - Degraded / Down -> Healthy: Success Recovery notification
   */
  handleHealthTransition(params: {
    endpoint: Endpoint;
    prevStatus: EndpointStatus;
    newStatus: EndpointStatus;
    statusCode: number;
    responseTime: number;
    healthScore: number;
    degradationReason?: string;
    failureType?: string;
  }): AppNotification | null {
    const { endpoint, prevStatus, newStatus, statusCode, responseTime, healthScore, degradationReason, failureType } = params;

    // Ongoing incident deduplication: don't create repeat alerts if status hasn't changed
    if (prevStatus === newStatus) {
      return null;
    }

    const metadata = {
      statusCode,
      responseTime,
      healthScore,
      failureReason: degradationReason,
      incidentId: `${endpoint.id}_${newStatus}`,
    };

    // 1. Critical Failure / Unhealthy Outage
    if (newStatus === 'down' || newStatus === 'unhealthy' || healthScore < 50) {
      return this.createNotification({
        projectId: endpoint.projectId,
        endpointId: endpoint.id,
        title: `🚨 Outage Detected: ${endpoint.method} ${endpoint.path} is Unhealthy`,
        message: degradationReason || `Health check failed with HTTP ${statusCode} (${responseTime}ms). API is currently unavailable or returning errors.`,
        severity: 'critical',
        type: 'unhealthy',
        metadata,
      });
    }

    // 2. Performance Degradation / Warning
    if (newStatus === 'degraded' || (healthScore >= 50 && healthScore < 90)) {
      return this.createNotification({
        projectId: endpoint.projectId,
        endpointId: endpoint.id,
        title: `⚠️ Performance Degraded: ${endpoint.method} ${endpoint.path}`,
        message: degradationReason || `Health score dropped to ${healthScore}/100. Latency is ${responseTime}ms.`,
        severity: 'warning',
        type: 'degraded',
        metadata,
      });
    }

    // 3. Recovery: Transitioned back to Healthy
    if ((prevStatus === 'degraded' || prevStatus === 'down' || prevStatus === 'unhealthy') && newStatus === 'healthy') {
      // Auto-mark prior unread failure notifications for this endpoint as read
      const unreadForEp = db.notifications.filter(n => n.endpointId === endpoint.id && !n.isRead && (n.type === 'degraded' || n.type === 'unhealthy'));
      for (const n of unreadForEp) {
        n.isRead = true;
      }

      return this.createNotification({
        projectId: endpoint.projectId,
        endpointId: endpoint.id,
        title: `✅ API Recovered: ${endpoint.method} ${endpoint.path} is Healthy`,
        message: `Endpoint has recovered and is operating normally with optimal response time (${responseTime}ms). Health score restored to ${healthScore}/100.`,
        severity: 'success',
        type: 'recovered',
        metadata,
      });
    }

    return null;
  },
};
