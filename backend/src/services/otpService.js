/**
 * OTP issue and verification, shared by account verification and OTP login.
 *
 *  issue:  rate checks → generate (CSPRNG) → invalidate previous active code →
 *          store HMAC hash + expiry → deliver through the configured provider
 *  verify: lock latest active code → expiry/attempt checks → constant-time
 *          compare → count failed attempt (invalidate at limit) or mark verified
 *
 * Callers only ever learn "valid" or "invalid or expired" — never why.
 */
const config = require('../config/environment');
const { getDb } = require('../config/database');
const OtpCode = require('../models/otpCodeModel');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const { generateOtp, hmacSha256, safeEqualHex } = require('../utils/securityTokens');
const { deliverOtp } = require('./otpDelivery');

const INVALID_OTP = 'Invalid or expired OTP';

const hashOtp = (code) => hmacSha256(code, config.otpSecret());

async function assertSendAllowed({ userId, purpose, channel }, now) {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const recent = await OtpCode.query()
    .where({ user_id: userId, purpose, channel })
    .where('created_at', '>=', hourAgo)
    .orderBy('created_at', 'desc')
    .select('created_at');

  if (recent.length > 0) {
    const elapsed = (now.getTime() - new Date(recent[0].created_at).getTime()) / 1000;
    const wait = Math.ceil(config.otp.resendCooldownSeconds - elapsed);
    if (wait > 0) {
      throw new ApiError(HTTP.TOO_MANY_REQUESTS, `Please wait ${wait} seconds before requesting another OTP`);
    }
  }
  if (recent.length >= config.otp.maxSendsPerHour) {
    throw new ApiError(HTTP.TOO_MANY_REQUESTS, 'Too many OTP requests. Please try again later.');
  }
}

/**
 * Creates and sends a new OTP. Returns { expiresAt } — never the code.
 */
async function issueOtp({ userId, purpose, channel, destination }) {
  const now = new Date();
  await assertSendAllowed({ userId, purpose, channel }, now);

  const code = generateOtp(config.otp.length);
  const expiresAt = new Date(now.getTime() + config.otp.expiryMinutes * 60 * 1000);

  await getDb().transaction(async (trx) => {
    await OtpCode.query(trx)
      .where({ user_id: userId, purpose, channel, status: 'active' })
      .update({ status: 'invalidated' });
    await OtpCode.query(trx).insert({
      user_id: userId,
      purpose,
      channel,
      otp_hash: hashOtp(code),
      expires_at: expiresAt,
    });
  });

  await deliverOtp({ channel, destination, code, purpose, expiresAt });
  return { expiresAt };
}

/**
 * Verifies a submitted code. Resolves on success; otherwise throws 401
 * "Invalid or expired OTP". Failed attempts are committed even though the
 * request fails.
 */
async function verifyOtp({ userId, purpose, channel, code }) {
  const outcome = await getDb().transaction(async (trx) => {
    const otp = await OtpCode.query(trx)
      .where({ user_id: userId, purpose, channel, status: 'active' })
      .orderBy('otp_id', 'desc')
      .forUpdate()
      .first();

    if (!otp) return 'invalid';
    if (new Date(otp.expires_at) <= new Date() || otp.attempts >= config.otp.maxAttempts) {
      await OtpCode.query(trx).where({ otp_id: otp.otp_id }).update({ status: 'invalidated' });
      return 'invalid';
    }

    if (!safeEqualHex(hashOtp(code), otp.otp_hash)) {
      const attempts = otp.attempts + 1;
      await OtpCode.query(trx)
        .where({ otp_id: otp.otp_id })
        .update({ attempts, ...(attempts >= config.otp.maxAttempts && { status: 'invalidated' }) });
      return 'invalid';
    }

    await OtpCode.query(trx)
      .where({ otp_id: otp.otp_id })
      .update({ status: 'verified', verified_at: new Date() });
    return 'verified';
  });

  if (outcome !== 'verified') throw new ApiError(HTTP.UNAUTHORIZED, INVALID_OTP);
}

module.exports = { issueOtp, verifyOtp, INVALID_OTP };
