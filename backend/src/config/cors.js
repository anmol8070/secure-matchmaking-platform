/**
 * CORS policy, driven by CORS_ORIGIN.
 *
 * - Requests without an Origin header (Postman, curl, server-to-server) are allowed.
 * - Browser requests from an origin not on the list are rejected with 403
 *   before reaching any route, so they cannot trigger side effects.
 * - "*" reflects any origin, and is refused in production by environment validation.
 */
const config = require('./environment');
const ApiError = require('../utils/ApiError');

function buildCorsOptions(allowedOrigins = config.corsOrigins) {
  const allowAny = allowedOrigins.includes('*');

  return {
    origin(origin, callback) {
      if (!origin || allowAny || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(ApiError.forbidden('Origin not allowed by CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  };
}

module.exports = { buildCorsOptions };
