import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Project } from '../../types/index.js';

export const projectsController = {
  /**
   * List projects with active vs history filtering, environment/status filters,
   * search, and user authorization.
   */
  list: (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10);
    const search = ((req.query.search as string) || '').toLowerCase().trim();
    const status = req.query.status as string;
    const environment = req.query.environment as string;
    const tab = (req.query.tab as string) || 'active'; // 'active' or 'history'
    const currentUser = (req as any).user;

    let items = db.projects;

    // 1. Authorization: users only see their own projects, unless admin or unassigned
    if (currentUser && currentUser.role !== 'admin') {
      items = items.filter(p => !p.userId || p.userId === currentUser.id);
    }

    // 2. Tab filtering: Active vs History (deleted/archived)
    if (tab === 'history') {
      items = items.filter(p => p.status === 'deleted' || p.status === 'archived' || Boolean(p.deletedAt));
      // Sort most recently deleted/archived first
      items.sort((a, b) => {
        const timeA = new Date(a.deletedAt || a.updatedAt).getTime();
        const timeB = new Date(b.deletedAt || b.updatedAt).getTime();
        return timeB - timeA;
      });
    } else {
      // Default 'active' tab: only non-deleted active projects
      items = items.filter(p => p.status !== 'deleted' && !p.deletedAt);
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // 3. Search filter
    if (search) {
      items = items.filter(p =>
        p.name.toLowerCase().includes(search) ||
        (p.description && p.description.toLowerCase().includes(search)) ||
        p.baseUrl.toLowerCase().includes(search)
      );
    }

    // 4. Environment filter
    if (environment && environment !== 'all') {
      items = items.filter(p => p.environment === environment);
    }

    // 5. Specific status filter
    if (status && status !== 'all') {
      items = items.filter(p => p.status === status);
    }

    // 6. Dynamic endpoint count
    items = items.map(p => ({
      ...p,
      endpointCount: db.endpoints.filter(e => e.projectId === p.id).length,
    }));

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

  getById: (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as any).user;
    const project = db.projects.find(p => p.id === id);

    if (!project) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    // Authorization check
    if (currentUser && currentUser.role !== 'admin' && project.userId && project.userId !== currentUser.id) {
      return res.status(403).json({ message: 'Access denied to this project' });
    }

    const endpointCount = db.endpoints.filter(e => e.projectId === project.id).length;
    return res.json({ ...project, endpointCount });
  },

  create: async (req: Request, res: Response) => {
    const { name, description = '', baseUrl, environment = 'production', tags = [] } = req.body;
    const currentUser = (req as any).user;

    if (!name || !baseUrl) {
      return res.status(400).json({ message: 'Project name and baseUrl are required' });
    }

    const newProject: Project = {
      id: `p_${uuidv4().slice(0, 8)}`,
      name: name.trim(),
      description: description.trim(),
      status: 'active',
      baseUrl: baseUrl.trim().replace(/\/+$/, ''),
      environment,
      endpointCount: 0,
      healthScore: 100,
      userId: currentUser?.id,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags,
    };

    // Save to real SQLite database
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT OR REPLACE INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, user_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            newProject.id,
            newProject.name,
            newProject.description,
            newProject.status,
            newProject.baseUrl,
            newProject.environment,
            0,
            100,
            newProject.userId || null,
            null,
            newProject.createdAt,
            newProject.updatedAt,
          ]
        );
      } catch (err: any) {
        console.warn('[Projects] SQLite error:', err.message);
      }
    }

    // Save to PostgreSQL if connected
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'INSERT INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, user_id, deleted_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
          [
            newProject.id,
            newProject.name,
            newProject.description,
            newProject.status,
            newProject.baseUrl,
            newProject.environment,
            0,
            100,
            newProject.userId || null,
            null,
            newProject.createdAt,
            newProject.updatedAt,
          ]
        );
      } catch (err: any) {
        console.warn('[Projects] Postgres error:', err.message);
      }
    }

    db.projects.unshift(newProject);
    db.save();

    return res.status(201).json(newProject);
  },

  update: (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as any).user;
    const index = db.projects.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    const existing = db.projects[index];

    // Authorization check
    if (currentUser && currentUser.role !== 'admin' && existing.userId && existing.userId !== currentUser.id) {
      return res.status(403).json({ message: 'Access denied to update this project' });
    }

    const updated: Project = {
      ...existing,
      ...req.body,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    db.projects[index] = updated;

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE projects SET name = ?, description = ?, base_url = ?, environment = ?, status = ?, updated_at = ? WHERE id = ?',
          [updated.name, updated.description, updated.baseUrl, updated.environment, updated.status, updated.updatedAt, id]
        );
      } catch {}
    }

    if (postgresService.isConnected) {
      postgresService.query(
        'UPDATE projects SET name = $1, description = $2, base_url = $3, environment = $4, status = $5, updated_at = $6 WHERE id = $7',
        [updated.name, updated.description, updated.baseUrl, updated.environment, updated.status, updated.updatedAt, id]
      ).catch(() => {});
    }

    db.save();
    return res.json(updated);
  },

  /**
   * Soft Delete: Marks project as deleted and sets deleted_at timestamp.
   * Immediately stops all associated endpoint monitoring jobs and disables alert rules.
   */
  delete: async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as any).user;
    const project = db.projects.find(p => p.id === id);

    if (!project) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    // Authorization check
    if (currentUser && currentUser.role !== 'admin' && project.userId && project.userId !== currentUser.id) {
      return res.status(403).json({ message: 'Access denied to delete this project' });
    }

    const now = new Date().toISOString();
    project.status = 'deleted';
    project.deletedAt = now;
    project.updatedAt = now;

    // Stop and pause all associated endpoints
    let pausedEndpointsCount = 0;
    for (const ep of db.endpoints) {
      if (ep.projectId === id) {
        ep.status = 'paused';
        pausedEndpointsCount++;
      }
    }

    // Disable all associated alert rules
    for (const ar of db.alertRules) {
      if (ar.projectId === id) {
        ar.isEnabled = false;
      }
    }

    // Update SQLite
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE projects SET status = ?, deleted_at = ?, updated_at = ? WHERE id = ?',
          ['deleted', now, now, id]
        );
        sqliteService.execute('UPDATE endpoints SET status = ? WHERE project_id = ?', ['paused', id]);
        sqliteService.execute('UPDATE alert_rules SET is_enabled = 0 WHERE project_id = ?', [id]);
      } catch (err: any) {
        console.warn('[Projects] SQLite soft-delete warning:', err.message);
      }
    }

    // Update PostgreSQL
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'UPDATE projects SET status = $1, deleted_at = $2, updated_at = $3 WHERE id = $4',
          ['deleted', now, now, id]
        );
        await postgresService.query('UPDATE endpoints SET status = $1 WHERE project_id = $2', ['paused', id]);
        await postgresService.query('UPDATE alert_rules SET is_enabled = false WHERE project_id = $1', [id]);
      } catch (err: any) {
        console.warn('[Projects] Postgres soft-delete warning:', err.message);
      }
    }

    db.save();
    return res.json({
      success: true,
      message: `Project "${project.name}" moved to Project History. Monitoring stopped for ${pausedEndpointsCount} endpoint(s).`,
      project,
    });
  },

  /**
   * Restore Project: Re-activates a soft-deleted or archived project.
   * Restores associated endpoints to healthy monitoring status and re-enables alert rules.
   */
  restore: async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as any).user;
    const project = db.projects.find(p => p.id === id);

    if (!project) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    // Authorization check
    if (currentUser && currentUser.role !== 'admin' && project.userId && project.userId !== currentUser.id) {
      return res.status(403).json({ message: 'Access denied to restore this project' });
    }

    if (project.status === 'active' && !project.deletedAt) {
      return res.status(400).json({ message: `Project "${project.name}" is already active` });
    }

    const now = new Date().toISOString();
    project.status = 'active';
    project.deletedAt = null;
    project.updatedAt = now;

    // Restore associated endpoints to healthy (resuming monitoring)
    let restoredEndpointsCount = 0;
    for (const ep of db.endpoints) {
      if (ep.projectId === id) {
        ep.status = 'healthy';
        restoredEndpointsCount++;
      }
    }

    // Re-enable alert rules
    for (const ar of db.alertRules) {
      if (ar.projectId === id) {
        ar.isEnabled = true;
      }
    }

    // Update SQLite
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'UPDATE projects SET status = ?, deleted_at = NULL, updated_at = ? WHERE id = ?',
          ['active', now, id]
        );
        sqliteService.execute('UPDATE endpoints SET status = ? WHERE project_id = ?', ['healthy', id]);
        sqliteService.execute('UPDATE alert_rules SET is_enabled = 1 WHERE project_id = ?', [id]);
      } catch (err: any) {
        console.warn('[Projects] SQLite restore warning:', err.message);
      }
    }

    // Update PostgreSQL
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'UPDATE projects SET status = $1, deleted_at = NULL, updated_at = $2 WHERE id = $3',
          ['active', now, id]
        );
        await postgresService.query('UPDATE endpoints SET status = $1 WHERE project_id = $2', ['healthy', id]);
        await postgresService.query('UPDATE alert_rules SET is_enabled = true WHERE project_id = $1', [id]);
      } catch (err: any) {
        console.warn('[Projects] Postgres restore warning:', err.message);
      }
    }

    db.save();
    return res.json({
      success: true,
      message: `Project "${project.name}" restored successfully to Active Projects. Resumed ${restoredEndpointsCount} endpoint(s).`,
      project,
    });
  },

  /**
   * Permanent Deletion: Permanently removes project and cascades deletion
   * across all associated endpoints, alert rules, incidents, logs, and AI insights.
   */
  permanentDelete: async (req: Request, res: Response) => {
    const { id } = req.params;
    const currentUser = (req as any).user;
    const projectIndex = db.projects.findIndex(p => p.id === id);

    if (projectIndex === -1) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    const project = db.projects[projectIndex];

    // Authorization check
    if (currentUser && currentUser.role !== 'admin' && project.userId && project.userId !== currentUser.id) {
      return res.status(403).json({ message: 'Access denied to permanently delete this project' });
    }

    // Remove from in-memory collections
    db.projects.splice(projectIndex, 1);

    for (let i = db.endpoints.length - 1; i >= 0; i--) {
      if (db.endpoints[i].projectId === id) db.endpoints.splice(i, 1);
    }
    for (let i = db.alertRules.length - 1; i >= 0; i--) {
      if (db.alertRules[i].projectId === id) db.alertRules.splice(i, 1);
    }
    for (let i = db.alerts.length - 1; i >= 0; i--) {
      if (db.alerts[i].projectId === id) db.alerts.splice(i, 1);
    }
    for (let i = db.logs.length - 1; i >= 0; i--) {
      if (db.logs[i].projectId === id) db.logs.splice(i, 1);
    }
    for (let i = db.aiInsights.length - 1; i >= 0; i--) {
      if (db.aiInsights[i].projectId === id) db.aiInsights.splice(i, 1);
    }

    // Cascade delete in SQLite
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('DELETE FROM projects WHERE id = ?', [id]);
        sqliteService.execute('DELETE FROM endpoints WHERE project_id = ?', [id]);
        sqliteService.execute('DELETE FROM alert_rules WHERE project_id = ?', [id]);
        sqliteService.execute('DELETE FROM alerts WHERE project_id = ?', [id]);
        sqliteService.execute('DELETE FROM request_logs WHERE project_id = ?', [id]);
      } catch (err: any) {
        console.warn('[Projects] SQLite permanent delete error:', err.message);
      }
    }

    // Cascade delete in PostgreSQL
    if (postgresService.isConnected) {
      try {
        await postgresService.query('DELETE FROM projects WHERE id = $1', [id]);
      } catch (err: any) {
        console.warn('[Projects] Postgres permanent delete error:', err.message);
      }
    }

    db.save();
    return res.json({
      success: true,
      message: `Project "${project.name}" and all associated data permanently removed from the system.`,
    });
  },
};
