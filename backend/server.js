/**
 * Process entry point: starts the HTTP server and handles shutdown.
 */
const app = require('./src/app');
const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { testConnection, closeConnection } = require('./src/config/database');

if (config.corsOrigins.length === 0) {
  logger.warn('CORS_ORIGIN is empty — browser requests from any origin will be rejected');
}

const server = app.listen(config.port, () => {
  logger.info(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
  logger.info(`Health check: http://localhost:${config.port}${config.apiPrefix}/health`);
  // Non-blocking: the API still starts if the database is not available yet.
  testConnection();
});

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await closeConnection();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});
