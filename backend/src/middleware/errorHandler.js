/**
 * Centralised error handler — must be registered after all routes.
 * Internal details (stack traces, raw messages of unexpected errors) are never
 * sent to the client in production.
 */
const config = require('../config/env');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') {
    err.statusCode = 400;
    err.message = 'Malformed JSON in request body';
    err.isOperational = true;
  }

  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  if (isServerError) {
    logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, err.stack || err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
  }

  const exposeMessage = err.isOperational || !config.isProduction;
  const body = {
    success: false,
    message: exposeMessage ? err.message : 'Internal server error',
  };

  if (err.details) body.details = err.details;
  // Stack traces help debug unexpected failures locally but are never sent in production
  if (!config.isProduction && isServerError && err.stack) body.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
