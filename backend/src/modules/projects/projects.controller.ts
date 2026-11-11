import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/store.js';
import { sqliteService } from '../../db/sqlite.js';
import { postgresService } from '../../db/postgres.js';
import type { Project } from '../../types/index.js';

export const projectsController = {
  list: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);
    const search = (req.query.search as string || '').toLowerCase();
    const status = req.query.status as string;

    let items = db.projects;

    if (search) {
      items = items.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.baseUrl.toLowerCase().includes(search)
      );
    }

    if (status && status !== 'all') {
      items = items.filter(p => p.status === status);
    }

    // Refresh endpoint count for each project
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
    const project = db.projects.find(p => p.id === id);
    if (!project) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    const endpointCount = db.endpoints.filter(e => e.projectId === project.id).length;
    return res.json({ ...project, endpointCount });
  },

  create: async (req: Request, res: Response) => {
    const { name, description = '', baseUrl, environment = 'production', tags = [] } = req.body;
    if (!name || !baseUrl) {
      return res.status(400).json({ message: 'Project name and baseUrl are required' });
    }

    const newProject: Project = {
      id: `p_${uuidv4().slice(0, 8)}`,
      name,
      description,
      status: 'active',
      baseUrl: baseUrl.replace(/\/+$/, ''),
      environment,
      endpointCount: 0,
      healthScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags,
    };

    // Save to real SQLite database
    if (sqliteService.isConnected) {
      try {
        sqliteService.execute(
          'INSERT OR REPLACE INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [newProject.id, newProject.name, newProject.description, newProject.status, newProject.baseUrl, newProject.environment, 0, 100, newProject.createdAt, newProject.updatedAt]
        );
      } catch (err: any) {
        console.warn('[Projects] SQLite error:', err.message);
      }
    }

    // Save to PostgreSQL if connected
    if (postgresService.isConnected) {
      try {
        await postgresService.query(
          'INSERT INTO projects (id, name, description, status, base_url, environment, endpoint_count, health_score, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
          [newProject.id, newProject.name, newProject.description, newProject.status, newProject.baseUrl, newProject.environment, 0, 100, newProject.createdAt, newProject.updatedAt]
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
    const index = db.projects.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    const existing = db.projects[index];
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

    db.save();
    return res.json(updated);
  },

  delete: (req: Request, res: Response) => {
    const { id } = req.params;
    const index = db.projects.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ message: `Project with ID ${id} not found` });
    }

    const removed = db.projects.splice(index, 1)[0];
    for (let i = db.endpoints.length - 1; i >= 0; i--) {
      if (db.endpoints[i].projectId === id) db.endpoints.splice(i, 1);
    }
    for (let i = db.alertRules.length - 1; i >= 0; i--) {
      if (db.alertRules[i].projectId === id) db.alertRules.splice(i, 1);
    }

    if (sqliteService.isConnected) {
      try {
        sqliteService.execute('DELETE FROM projects WHERE id = ?', [id]);
        sqliteService.execute('DELETE FROM endpoints WHERE project_id = ?', [id]);
      } catch {}
    }

    db.save();
    return res.json({ message: `Project "${removed.name}" removed` });
  },
};
