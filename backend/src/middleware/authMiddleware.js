/**
 * requireAuth — protects routes with a Bearer access token.
 *
 *   Authorization: Bearer <JWT>
 *
 * Verifies signature + expiry, checks the server-side session (not revoked)
 * and that the account is still active, then sets:
 *   req.user  — the user row (never sent to clients as-is; use User.toPublic)
 *   req.auth  — { userId, role, sessionId }
 *
 * The temporary login verification token is not a JWT and is always rejected here.
 */
const ApiError = require('../utils/ApiError');
const sessionService = require('../services/sessionService');

const BEARER = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

async function requireAuth(req, res, next) {
  const header = req.get('authorization');
  if (!header) return next(ApiError.unauthorized('Authentication required'));

  const match = BEARER.exec(header.trim());
  if (!match) return next(ApiError.unauthorized('Invalid or expired token'));

  const { user, session } = await sessionService.authenticate(match[1]);
  req.user = user;
  req.auth = { userId: user.user_id, role: user.role, sessionId: session.session_id };
  return next();
}

module.exports = { requireAuth };
