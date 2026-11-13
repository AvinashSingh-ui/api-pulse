import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/index.js';
import { swaggerDocument } from './docs/swagger.js';
import { errorHandler } from './middlewares/errorHandler.js';

// Route imports
import authRoutes from './modules/auth/auth.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import endpointsRoutes from './modules/endpoints/endpoints.routes.js';
import monitoringRoutes from './modules/monitoring/monitoring.routes.js';
import logsRoutes from './modules/logs/logs.routes.js';
import alertsRoutes from './modules/alerts/alerts.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import testingRoutes from './modules/testing/testing.routes.js';
import openapiRoutes from './modules/openapi/openapi.routes.js';
import mockRoutes from './modules/mock/mock.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';

export function createApp() {
  const app = express();

  // CORS config
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman) or localhost origins
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Basic request logger
  app.use((req, _res, next) => {
    if (process.env.NODE_ENV !== 'test') {
      const ts = new Date().toISOString().substring(11, 19);
      console.log(`[${ts}] ${req.method} ${req.url}`);
    }
    next();
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'API Pulse Backend',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Swagger UI docs
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Mount API v1 Routes
  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/projects', projectsRoutes);
  v1.use('/endpoints', endpointsRoutes);
  v1.use('/monitoring', monitoringRoutes);
  v1.use('/logs', logsRoutes);
  v1.use('/alerts', alertsRoutes);
  v1.use('/ai', aiRoutes);
  v1.use('/testing', testingRoutes);
  v1.use('/openapi', openapiRoutes);
  v1.use('/mock', mockRoutes);
  v1.use('/notifications', notificationsRoutes);

  app.use('/api/v1', v1);

  // Serve static frontend assets if built
  const frontendDist = path.resolve(process.cwd(), '..', 'frontend', 'dist');
  const localFrontendDist = path.resolve(process.cwd(), 'frontend', 'dist');
  const publicDir = fs.existsSync(frontendDist) ? frontendDist : (fs.existsSync(localFrontendDist) ? localFrontendDist : null);

  if (publicDir) {
    app.use(express.static(publicDir));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
        return next();
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  } else {
    // 404 handler for API
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ message: 'Resource not found', code: 'NOT_FOUND', status: 404 });
    });
  }

  // Global error handler
  app.use(errorHandler);

  return app;
}

