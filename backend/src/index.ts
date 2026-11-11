import { createApp } from './app.js';
import { config } from './config/index.js';
import { monitoringScheduler } from './modules/monitoring/scheduler.js';
import { postgresService } from './db/postgres.js';

const app = createApp();

const server = app.listen(config.port, async () => {
  console.log(`====================================================`);
  console.log(`🚀 API Pulse Backend running on http://localhost:${config.port}`);
  console.log(`📡 API Base URL:  http://localhost:${config.port}/api/v1`);
  console.log(`📖 Swagger Docs:  http://localhost:${config.port}/api/docs`);
  console.log(`🩺 Health Check:  http://localhost:${config.port}/health`);
  console.log(`====================================================`);

  // Connect to PostgreSQL database & run schema migrations
  await postgresService.connectAndMigrate();

  // Start background monitoring service
  monitoringScheduler.start(15000);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n[Server] Shutting down gracefully...');
  monitoringScheduler.stop();
  await postgresService.close();
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

