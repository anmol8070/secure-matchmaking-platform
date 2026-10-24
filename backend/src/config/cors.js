/**
 * CORS policy, driven by CORS_ORIGIN.
 *
 * - Requests without an Origin header (Postman, curl, server-to-server) are allowed.
 * - Browser requests from an origin not on the list are rejected with 403
 *   before reaching any route, so they cannot trigger side effects.
 * - "*" reflects any origin, and is refused in production by environment validation.
 *   It is never combined with a wildcard response while credentials are enabled:
 *   allowed browser origins are reflected exactly.
 * - The deployed Vercel frontend is always permitted, in addition to CORS_ORIGIN,
 *   so a production list that only names local development still accepts it.
 *   Preflight OPTIONS is handled by the cors middleware (methods include OPTIONS).
 */
const config = require('./environment');
const ApiError = require('../utils/ApiError');

const DEPLOYED_FRONTEND_ORIGIN = 'https://secure-matchmaking-platform.vercel.app';

function buildCorsOptions(allowedOrigins = config.corsOrigins) {
  const configured = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  const allowAny = configured.includes('*');
  // Reflect specific origins only. Never send Access-Control-Allow-Origin: *.
  const permitted = allowAny
    ? configured
    : [...new Set([...configured.filter(Boolean), DEPLOYED_FRONTEND_ORIGIN])];

  return {
    origin(origin, callback) {
      if (!origin || allowAny || permitted.includes(origin)) {
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
