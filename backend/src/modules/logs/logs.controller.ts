import { Request, Response } from 'express';
import { db } from '../../db/store.js';
import type { RequestLog } from '../../types/index.js';

function redactSensitiveData(log: RequestLog): RequestLog {
  const cloned = { ...log };
  // Mask sensitive headers/body if present
  if (cloned.requestHeaders) {
    const masked: Record<string, string> = { ...cloned.requestHeaders };
    for (const key of Object.keys(masked)) {
      if (['authorization', 'cookie', 'x-api-key', 'token'].includes(key.toLowerCase())) {
        masked[key] = '[REDACTED]';
      }
    }
    cloned.requestHeaders = masked;
  }
  return cloned;
}

export const logsController = {
  list: (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || '1', 10);
    const pageSize = parseInt(req.query.pageSize as string || '20', 10);
    const search = (req.query.search as string || '').toLowerCase();
    const projectId = req.query.projectId as string;
    const endpointId = req.query.endpointId as string;
    const statusCode = req.query.statusCode ? parseInt(req.query.statusCode as string, 10) : undefined;
    const method = req.query.method as string;
    const errorsOnly = req.query.errorsOnly === 'true';

    let items = db.logs.map(redactSensitiveData);

    if (projectId) {
      items = items.filter(l => l.projectId === projectId);
    }

    if (endpointId) {
      items = items.filter(l => l.endpointId === endpointId);
    }

    if (statusCode) {
      items = items.filter(l => l.statusCode === statusCode);
    }

    if (method && method !== 'all') {
      items = items.filter(l => l.method === method.toUpperCase());
    }

    if (errorsOnly) {
      items = items.filter(l => l.statusCode >= 400 || (l.failureType && l.failureType !== 'none'));
    }

    if (search) {
      items = items.filter(l =>
        l.path.toLowerCase().includes(search) ||
        l.ip.includes(search) ||
        (l.error && l.error.toLowerCase().includes(search))
      );
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

  getById: (req: Request, res: Response) => {
    const { id } = req.params;
    const log = db.logs.find(l => l.id === id);
    if (!log) {
      return res.status(404).json({ message: `Log with ID ${id} not found` });
    }
    return res.json(redactSensitiveData(log));
  },

  exportLogs: (req: Request, res: Response) => {
    const format = req.query.format === 'json' ? 'json' : 'csv';

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="api_pulse_logs.json"');
      return res.json(db.logs.map(redactSensitiveData));
    }

    // CSV format
    const headers = ['ID', 'Timestamp', 'Method', 'Path', 'Status', 'DurationMs', 'ClientIP', 'FailureType', 'Error'];
    const rows = db.logs.map(l => [
      l.id,
      l.timestamp,
      l.method,
      `"${l.path}"`,
      l.statusCode,
      l.responseTime,
      l.ip,
      l.failureType || 'none',
      `"${(l.error || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="api_pulse_logs.csv"');
    return res.send(csvContent);
  },
};

