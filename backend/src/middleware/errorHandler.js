/**
 * Centralised error handler — registered last in app.js.
 *
 * Every error becomes { success: false, message, errors? } with a proper status:
 *   ApiError (validation 422, auth 401/403, not found 404, conflict 409, 501…)
 *   body-parser errors (400 malformed JSON, 413 too large)
 *   database errors (409/422/400, or 503 when the database is unreachable)
 *   JWT errors (401) — used from Phase 4
 *   anything else → 500 "Something went wrong"
 *
 * Stack traces are returned only for 5xx errors outside production.
 */
const config = require('../config/environment');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const MESSAGES = require('../constants/messages');
const { buildErrorBody } = require('../utils/apiResponse');
const { translateDbError, describeDbError } = require('../utils/dbErrors');

function normalise(err) {
  if (err instanceof ApiError) return { apiError: err };

  if (err.type === 'entity.parse.failed') {
    return { apiError: ApiError.badRequest(MESSAGES.MALFORMED_JSON) };
  }
  if (err.type === 'entity.too.large') {
    return { apiError: new ApiError(HTTP.PAYLOAD_TOO_LARGE, MESSAGES.PAYLOAD_TOO_LARGE) };
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return { apiError: ApiError.unauthorized('Invalid or expired token') };
  }

  const dbError = translateDbError(err);
  if (dbError) return { apiError: dbError, isDbError: true };

  return { apiError: null };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { apiError, isDbError } = normalise(err);
  const statusCode = apiError ? apiError.statusCode : HTTP.INTERNAL_SERVER_ERROR;
  const route = `${req.method} ${req.path}`;

  // Logs never include request bodies or raw DB messages (they can contain SQL with personal data).
  if (isDbError) {
    logger.error(`${route} -> ${statusCode} database error`, describeDbError(err));
  } else if (!apiError) {
    logger.error(`${route} -> ${statusCode} unexpected error`, err);
  } else {
    logger.warn(`${route} -> ${statusCode}: ${apiError.message}`);
  }

  const message = apiError ? apiError.message : MESSAGES.INTERNAL_ERROR;
  const body = buildErrorBody(message, apiError && apiError.errors);

  if (!config.isProduction && !apiError && err.stack) body.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
