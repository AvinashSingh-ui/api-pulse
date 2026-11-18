import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'api_pulse_super_secret_jwt_key_2026_dev',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  defaultInterval: parseInt(process.env.MONITORING_INTERVAL_DEFAULT || '60', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  apiBaseUrl: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || '8000'}/api/v1`,
  routes: {
    auth: process.env.API_AUTH_ROUTE || '/api/v1/auth',
    projects: process.env.API_PROJECTS_ROUTE || '/api/v1/projects',
    endpoints: process.env.API_ENDPOINTS_ROUTE || '/api/v1/endpoints',
    monitoring: process.env.API_MONITORING_ROUTE || '/api/v1/monitoring',
    logs: process.env.API_LOGS_ROUTE || '/api/v1/logs',
    alerts: process.env.API_ALERTS_ROUTE || '/api/v1/alerts',
    ai: process.env.API_AI_ROUTE || '/api/v1/ai',
    testing: process.env.API_TESTING_ROUTE || '/api/v1/testing',
    openapi: process.env.API_OPENAPI_ROUTE || '/api/v1/openapi',
    notifications: process.env.API_NOTIFICATIONS_ROUTE || '/api/v1/notifications',
  },
};

