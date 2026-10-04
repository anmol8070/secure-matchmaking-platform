/**
 * Access tokens (JWT, HS256) backed by user_sessions rows.
 *
 * - Issued ONLY by authService.completeLoginVerification, i.e. after both
 *   credentials/OTP and the live presence check succeeded.
 * - Payload: { user_id, role, jti, typ: 'access' } — nothing sensitive.
 * - Every request re-checks the session row and the user's status, so logout
 *   and suspension take effect immediately.
 */
const jwt = require('jsonwebtoken');
const config = require('../config/environment');
const User = require('../models/userModel');
const UserSession = require('../models/userSessionModel');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const { generateToken } = require('../utils/securityTokens');

const ALGORITHM = 'HS256';
const SESSION_INVALID = 'Session has expired or been revoked. Please log in again.';

async function createSession(user, { loginVerificationId = null } = {}, trx) {
  const tokenId = generateToken(24);
  const accessToken = jwt.sign({ user_id: user.user_id, role: user.role, typ: 'access' }, config.jwtSecret(), {
    algorithm: ALGORITHM,
    expiresIn: config.jwt.expiresIn,
    jwtid: tokenId,
  });
  const { exp, iat } = jwt.decode(accessToken);

  await UserSession.query(trx).insert({
    user_id: user.user_id,
    token_id: tokenId,
    login_verification_id: loginVerificationId,
    expires_at: new Date(exp * 1000),
  });

  return { accessToken, expiresIn: exp - iat };
}

/**
 * Validates an access token and returns { user, session }.
 * Throws 401 for bad/expired/revoked tokens, 403 for accounts that may no longer sign in.
 */
async function authenticate(accessToken) {
  // Signature, algorithm and expiry; JsonWebTokenError/TokenExpiredError → 401 in errorHandler.
  const payload = jwt.verify(accessToken, config.jwtSecret(), { algorithms: [ALGORITHM] });
  if (payload.typ !== 'access' || !payload.jti) throw ApiError.unauthorized('Invalid or expired token');

  const session = await UserSession.query().where({ token_id: payload.jti }).first();
  if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
    throw ApiError.unauthorized(SESSION_INVALID);
  }

  const user = await User.findByPk(session.user_id);
  if (!user) throw ApiError.unauthorized(SESSION_INVALID);
  if (user.status !== 'active') {
    throw new ApiError(HTTP.FORBIDDEN, 'This account cannot access the service. Please contact support.');
  }
  return { user, session };
}

/** Revokes one session. Returns true if it was active. */
async function revokeSession(sessionId) {
  const updated = await UserSession.query()
    .where({ session_id: sessionId })
    .whereNull('revoked_at')
    .update({ revoked_at: new Date() });
  return updated > 0;
}

module.exports = { createSession, authenticate, revokeSession, SESSION_INVALID };
