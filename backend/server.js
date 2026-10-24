/**
 * Process entry point: validates configuration, starts the HTTP server,
 * checks the database and handles startup errors and shutdown.
 */
const config = require('./src/config/environment');
const logger = require('./src/utils/logger');
const { API_PREFIX } = require('./src/constants/api');
const { testConnection, closeConnection } = require('./src/config/database');
const { closeRedis } = require('./src/config/redis');

const problems = config.isProduction ? config.validateProductionReadiness() : config.validateEnvironment();
if (problems.length > 0) {
  problems.forEach((problem) => logger.error(`Configuration error: ${problem}`));
  process.exit(1);
}
if (!config.isProduction) {
  config.validateProductionReadiness().forEach((issue) => logger.warn(`Not ready for production: ${issue}`));
}
if (config.corsOrigins.length === 0) {
  logger.warn('CORS_ORIGIN is empty — browser requests from any origin will be rejected');
}

// The quiz questionnaire is configuration: fail fast if the file is missing or invalid.
try {
  require('./src/services/quizQuestionBank').getQuestionBank();
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

const http = require('http');
const app = require('./src/app');
const { attachSocketServer, closeSocketServer } = require('./src/sockets');

// One HTTP server for both the REST API and Socket.IO (Phase 11 private chat).
const server = http.createServer(app);
const io = attachSocketServer(server);
// With REDIS_URL the Socket.IO Redis adapter must be connected before traffic arrives.
io.ready
  .then(() => server.listen(config.port))
  .catch((err) => {
    logger.error('Could not connect to Redis (REDIS_URL)', { code: err.code || err.name });
    process.exit(1);
  });

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
  setTimeout(() => process.exit(1), 10000).unref();
  // Closes sockets (clients reconnect elsewhere) and then the HTTP server.
  await closeSocketServer(io);
  await closeRedis();
  await closeConnection();
  process.exit(0);
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
