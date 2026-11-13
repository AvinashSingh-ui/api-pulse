import { Request, Response } from 'express';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';

export const notificationsController = {
  list: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '50', 10);
    const severity = req.query.severity as string;
    const endpointId = req.query.endpointId as string;
    const unreadOnly = req.query.unreadOnly === 'true';
    const search = ((req.query.search as string) || '').toLowerCase().trim();

    // Only include notifications belonging to non-deleted projects
    const activeProjectIds = new Set(
      db.projects.filter(p => p.status === 'active' && !p.deletedAt).map(p => p.id)
    );

    let items = db.notifications.filter(n => !n.projectId || activeProjectIds.has(n.projectId));

    if (severity && severity !== 'all') {
      items = items.filter(n => n.severity === severity);
    }

    if (endpointId && endpointId !== 'all') {
      items = items.filter(n => n.endpointId === endpointId);
    }

    if (unreadOnly) {
      items = items.filter(n => !n.isRead);
    }

    if (search) {
      items = items.filter(n =>
        n.title.toLowerCase().includes(search) ||
        n.message.toLowerCase().includes(search) ||
        (n.endpointPath && n.endpointPath.toLowerCase().includes(search)) ||
        (n.projectName && n.projectName.toLowerCase().includes(search))
      );
    }

    const total = items.length;
    const unreadCount = items.filter(n => !n.isRead).length;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    return res.json({
      data: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      unreadCount,
    });
  },

  getUnreadCount: (_req: Request, res: Response) => {
    const activeProjectIds = new Set(
      db.projects.filter(p => p.status === 'active' && !p.deletedAt).map(p => p.id)
    );
    const count = db.notifications.filter(
      n => !n.isRead && (!n.projectId || activeProjectIds.has(n.projectId))
    ).length;

    return res.json({ unreadCount: count });
  },

  markAsRead: (req: Request, res: Response) => {
    const { id } = req.params;
    const notification = db.notifications.find(n => n.id === id);

    if (!notification) {
      return res.status(404).json({ message: `Notification with ID ${id} not found` });
    }

    notification.isRead = true;

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
      } catch (err: any) {
        console.warn('[Notifications] SQLite markAsRead error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        postgresService.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]).catch(() => {});
      } catch {}
    }

    db.save();
    return res.json({ success: true, notification });
  },

  markAllAsRead: (_req: Request, res: Response) => {
    let updatedCount = 0;
    for (const n of db.notifications) {
      if (!n.isRead) {
        n.isRead = true;
        updatedCount++;
      }
    }

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('UPDATE notifications SET is_read = 1');
      } catch (err: any) {
        console.warn('[Notifications] SQLite markAllAsRead error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        postgresService.query('UPDATE notifications SET is_read = true').catch(() => {});
      } catch {}
    }

    db.save();
    return res.json({ success: true, count: updatedCount });
  },

  delete: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.notifications.findIndex(n => n.id === id);

    if (index === -1) {
      return res.status(404).json({ message: `Notification with ID ${id} not found` });
    }

    const removed = db.notifications.splice(index, 1)[0];

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('DELETE FROM notifications WHERE id = ?', [id]);
      } catch (err: any) {
        console.warn('[Notifications] SQLite delete error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        postgresService.query('DELETE FROM notifications WHERE id = $1', [id]).catch(() => {});
      } catch {}
    }

    db.save();
    return res.json({ success: true, message: 'Notification dismissed', id: removed.id });
  },

  clearAll: (_req: Request, res: Response) => {
    const count = db.notifications.length;
    db.notifications.length = 0;

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('DELETE FROM notifications');
      } catch (err: any) {
        console.warn('[Notifications] SQLite clearAll error:', err.message);
      }
    }

    if (postgresService.isConnected) {
      try {
        postgresService.query('DELETE FROM notifications').catch(() => {});
      } catch {}
    }

    db.save();
    return res.json({ success: true, message: `Cleared ${count} notification(s)` });
  },
};
