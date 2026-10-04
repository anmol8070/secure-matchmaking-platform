/**
 * Request rate limiting for authentication endpoints (in-memory store).
 *
 * - authLimiter: every /auth request, per IP.
 * - failedAttemptLimiter: failed password/OTP/verification checks, per IP +
 *   account. Only failures count, and the key includes the IP, so an attacker
 *   cannot lock a real user out from elsewhere (no account lockout).
 *
 * OTP resend frequency, OTP attempts and live-verification attempts are also
 * limited per account in the database (otpService, verificationService).
 *
 * Note: the memory store is per process. Use a shared store (e.g. Redis) when
 * running several instances.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config/environment');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');

function createLimiter({ limit, windowMinutes = config.rateLimit.windowMinutes, keyGenerator, skipSuccessfulRequests = false, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(keyGenerator && { keyGenerator }),
    handler: (req, res, next) => next(new ApiError(HTTP.TOO_MANY_REQUESTS, message)),
  });
}

/** Account part of the key: whichever identifier the request targets. */
function accountKey(req) {
  const body = req.body || {};
  const account = body.identifier || body.email || body.mobile || body.verification_token || '';
  return `${ipKeyGenerator(req.ip)}|${String(account).trim().toLowerCase().slice(0, 254)}`;
}

const authLimiter = createLimiter({
  limit: config.rateLimit.authMaxPerIp,
  message: 'Too many requests. Please try again later.',
});

const failedAttemptLimiter = createLimiter({
  limit: config.rateLimit.failedAttemptsMax,
  keyGenerator: accountKey,
  skipSuccessfulRequests: true,
  message: 'Too many failed attempts. Please wait a few minutes and try again.',
});

module.exports = { createLimiter, accountKey, authLimiter, failedAttemptLimiter };
