/**
 * Process entry point: validates configuration, starts the HTTP server,
 * checks the database and handles startup errors and shutdown.
 */
const config = require('./src/config/environment');
const logger = require('./src/utils/logger');
const { API_PREFIX } = require('./src/constants/api');
const { testConnection, closeConnection } = require('./src/config/database');

const problems = config.validateEnvironment();
if (problems.length > 0) {
  problems.forEach((problem) => logger.error(`Configuration error: ${problem}`));
  process.exit(1);
}
if (config.corsOrigins.length === 0) {
  logger.warn('CORS_ORIGIN is empty — browser requests from any origin will be rejected');
}

const app = require('./src/app');

const server = app.listen(config.port);

server.on('listening', () => {
  const { port } = server.address();
  logger.info(`Server running in ${config.nodeEnv} mode on port ${port}`);
  logger.info(`Health check: http://localhost:${port}${API_PREFIX}/health`);
  // Non-blocking: the API still starts if the database is not available yet.
  testConnection();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use — set a different PORT in .env`);
  } else {
    logger.error('Server failed to start', err);
  }
  process.exit(1);
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
