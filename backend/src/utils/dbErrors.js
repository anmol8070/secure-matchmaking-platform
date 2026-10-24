/**
 * Translates database driver errors into safe ApiErrors.
 *
 * Driver error messages often contain the full SQL statement and bound values
 * (which may include personal data), so they are NEVER sent to the client and
 * never logged — only the error code is kept.
 */
const ApiError = require('./ApiError');
const HTTP = require('../constants/httpStatus');
const MESSAGES = require('../constants/messages');

// PostgreSQL SQLSTATE codes and MySQL/MariaDB errno values.
const RULES = [
  { pg: ['23505'], mysql: [1062], status: HTTP.CONFLICT, message: MESSAGES.DUPLICATE_RECORD },
  { pg: ['23503'], mysql: [1452, 1216], status: HTTP.CONFLICT, message: MESSAGES.INVALID_REFERENCE },
  { pg: ['23001'], mysql: [1451, 1217], status: HTTP.CONFLICT, message: MESSAGES.RECORD_IN_USE },
  { pg: ['23514'], mysql: [4025, 3819], status: HTTP.UNPROCESSABLE_ENTITY, message: MESSAGES.CONSTRAINT_VIOLATION },
  { pg: ['23502'], mysql: [1048, 1364], status: HTTP.BAD_REQUEST, message: MESSAGES.CONSTRAINT_VIOLATION },
];

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'PROTOCOL_CONNECTION_LOST',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08001',
  '08003',
  '08006',
]);

function isConnectionError(err) {
  if (CONNECTION_CODES.has(err.code)) return true;
  // pg wraps refused connections in an AggregateError of socket errors
  if (Array.isArray(err.errors)) return err.errors.some((e) => CONNECTION_CODES.has(e.code));
  // Knex pool timeout while the database is unreachable
  return err.name === 'KnexTimeoutError';
}

/** Returns an ApiError for a recognised database error, otherwise null. */
function translateDbError(err) {
  if (!err || typeof err !== 'object') return null;
  if (isConnectionError(err)) return ApiError.serviceUnavailable();

  const isPgCode = typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);
  for (const rule of RULES) {
    // Our FKs use RESTRICT (23001) for blocked deletes, so 23503 means a missing parent row
    if (isPgCode && rule.pg.includes(err.code)) return new ApiError(rule.status, rule.message);
    if (typeof err.errno === 'number' && err.sqlState && rule.mysql.includes(err.errno)) {
      return new ApiError(rule.status, rule.message);
    }
  }
  return null;
}

/** True when a UNIQUE constraint rejected the write (PostgreSQL 23505 / MySQL 1062). */
function isUniqueViolation(err) {
  return Boolean(err) && (err.code === '23505' || err.errno === 1062);
}

/**
 * True when the database aborted the transaction to resolve a lock conflict
 * (deadlock or lock-wait timeout). Retrying the whole transaction is safe.
 */
function isRetryableLockError(err) {
  return Boolean(err) && (err.errno === 1213 || err.errno === 1205 || err.code === '40P01' || err.code === '40001');
}

/**
 * Runs a transactional function again when the database aborted it because
 * of a lock conflict (common for concurrent inserts on InnoDB). Other errors
 * are thrown unchanged.
 */
async function withLockRetry(fn, { attempts = 4 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableLockError(err) || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt + Math.floor(Math.random() * 20)));
    }
  }
}

/** Minimal, non-sensitive description of a DB error for logs. */
function describeDbError(err) {
  return { code: err.code, errno: err.errno, constraint: err.constraint, table: err.table };
}

module.exports = { translateDbError, describeDbError, isConnectionError, isUniqueViolation, isRetryableLockError, withLockRetry };
