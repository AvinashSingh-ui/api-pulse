import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Alert, AlertRule } from '../../types/index.js';

export const alertsController = {
  listAlerts: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);
    const status = req.query.status as string;
    const severity = req.query.severity as string;
    const projectId = req.query.projectId as string;

    let items = db.alerts;

    if (projectId) {
      items = items.filter(a => a.projectId === projectId);
    }

    if (status && status !== 'all') {
      items = items.filter(a => a.status === status);
    }

    if (severity && severity !== 'all') {
      items = items.filter(a => a.severity === severity);
    }

    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    return res.json({
      data: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  },

  acknowledgeAlert: (req: Request, res: Response) => {
    const { id } = req.params;
    const alert = db.alerts.find(a => a.id === id);
    if (!alert) {
      return res.status(404).json({ message: `Alert with ID ${id} not found` });
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date().toISOString();
    db.save();

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE alerts SET status = ?, acknowledged_at = ? WHERE id = ?',
          [alert.status, alert.acknowledgedAt, alert.id]
        );
      } catch (err: any) {
        console.warn('[Alerts] SQLite error:', err.message);
      }
    }

    return res.json(alert);
  },

  resolveAlert: (req: Request, res: Response) => {
    const { id } = req.params;
    const alert = db.alerts.find(a => a.id === id);
    if (!alert) {
      return res.status(404).json({ message: `Alert with ID ${id} not found` });
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    db.save();

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?',
          [alert.status, alert.resolvedAt, alert.id]
        );
      } catch (err: any) {
        console.warn('[Alerts] SQLite error:', err.message);
      }
    }

    return res.json(alert);
  },

  listRules: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);
    const projectId = req.query.projectId as string;

    let items = db.alertRules;

    if (projectId) {
      items = items.filter(r => r.projectId === projectId);
    }

    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    return res.json({
      data: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  },

  createRule: (req: Request, res: Response) => {
    const {
      projectId,
      endpointId,
      name,
      trigger = 'response_time',
      threshold,
      operator = 'gt',
      severity = 'high',
      channels = ['email'],
    } = req.body;

    if (!projectId || !name || threshold === undefined) {
      return res.status(400).json({ message: 'projectId, name, and threshold are required' });
    }

    const newRule: AlertRule = {
      id: `r_${uuidv4().slice(0, 8)}`,
      projectId,
      endpointId,
      name,
      trigger,
      threshold: Number(threshold),
      operator,
      severity,
      isEnabled: true,
      channels,
      createdAt: new Date().toISOString(),
    };

    db.alertRules.push(newRule);
    db.save();

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT OR REPLACE INTO alert_rules (id, project_id, endpoint_id, name, trigger_type, threshold, operator, severity, is_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newRule.id, newRule.projectId, newRule.endpointId || null, newRule.name, newRule.trigger, newRule.threshold, newRule.operator, newRule.severity, 1, newRule.createdAt]
        );
      } catch (err: any) {
        console.warn('[Alerts] SQLite error:', err.message);
      }
    }

    return res.status(201).json(newRule);
  },

  updateRule: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.alertRules.findIndex(r => r.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Alert rule with ID ${id} not found` });
    }

    const existing = db.alertRules[index];
    const updated: AlertRule = {
      ...existing,
      ...req.body,
      id: existing.id,
      projectId: existing.projectId,
    };

    db.alertRules[index] = updated;
    db.save();

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE alert_rules SET name = ?, trigger_type = ?, threshold = ?, operator = ?, severity = ?, is_enabled = ? WHERE id = ?',
          [updated.name, updated.trigger, updated.threshold, updated.operator, updated.severity, updated.isEnabled ? 1 : 0, updated.id]
        );
      } catch (err: any) {
        console.warn('[Alerts] SQLite error:', err.message);
      }
    }

    return res.json(updated);
  },

  deleteRule: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.alertRules.findIndex(r => r.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Alert rule with ID ${id} not found` });
    }

    db.alertRules.splice(index, 1);
    db.save();

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('DELETE FROM alert_rules WHERE id = ?', [id]);
      } catch (err: any) {
        console.warn('[Alerts] SQLite error:', err.message);
      }
    }

    return res.json({ message: 'Alert rule removed' });
  },
};

