/**
 * Authentication: registration, account OTP verification, password/OTP login,
 * live presence verification hand-off, final session, logout, current user.
 *
 *   register → OTP → verify-otp → account active
 *   login (password | OTP) → verification token → live presence check
 *     → completeLoginVerification → JWT (the ONLY place access tokens are issued)
 */
const { getDb } = require('../config/database');
const User = require('../models/userModel');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const { hashPassword, verifyPassword, verifyAgainstDummy } = require('../utils/password');
const { parseIdentifier, maskContact } = require('../utils/contact');
const otpService = require('./otpService');
const verificationService = require('./verificationService');
const sessionService = require('./sessionService');

const MESSAGES = Object.freeze({
  INVALID_CREDENTIALS: 'Invalid credentials',
  NOT_VERIFIED: 'Please verify your account with the OTP sent to you before logging in.',
  ACCOUNT_UNAVAILABLE: 'This account cannot sign in. Please contact support.',
  OTP_SENT_GENERIC: 'If the account exists, an OTP has been sent.',
});

const contactOf = ({ email, mobile }) => (email ? { channel: 'email', value: email } : { channel: 'mobile', value: mobile });

/** Rejects accounts that may not sign in. Called only AFTER credentials are proven. */
function assertCanLogin(user) {
  if (user.status === 'active') return;
  if (user.status === 'pending_verification') throw new ApiError(HTTP.FORBIDDEN, MESSAGES.NOT_VERIFIED);
  throw new ApiError(HTTP.FORBIDDEN, MESSAGES.ACCOUNT_UNAVAILABLE);
}

/* ---------------- Registration ---------------- */

async function register({ email, mobile, password }) {
  const conflicts = [];
  if (email && (await User.findByContact('email', email))) {
    conflicts.push({ field: 'body.email', message: 'This email is already registered' });
  }
  if (mobile && (await User.findByContact('mobile', mobile))) {
    conflicts.push({ field: 'body.mobile', message: 'This mobile number is already registered' });
  }
  if (conflicts.length) throw ApiError.conflict('An account with these details already exists', conflicts);

  const passwordHash = await hashPassword(password);
  // A concurrent duplicate still fails on the unique index → 409 via errorHandler.
  const userId = await User.insertAndGetId({
    email: email || null,
    mobile: mobile || null,
    password_hash: passwordHash,
    status: 'pending_verification',
  });

  const { channel, value } = contactOf({ email, mobile });
  await otpService.issueOtp({ userId, purpose: 'registration', channel, destination: value });

  return { user_id: userId, otp_required: true, otp_channel: channel, otp_destination: maskContact(channel, value) };
}

async function sendVerificationOtp(contact) {
  const { channel, value } = contactOf(contact);
  const user = await User.findByContact(channel, value);
  // Same response whether or not the account exists or still needs verification.
  if (user && user.status === 'pending_verification') {
    await otpService.issueOtp({ userId: user.user_id, purpose: 'registration', channel, destination: value });
  }
  return { message: MESSAGES.OTP_SENT_GENERIC };
}

async function verifyAccountOtp({ otp, ...contact }) {
  const { channel, value } = contactOf(contact);
  const user = await User.findByContact(channel, value);
  if (!user || user.status !== 'pending_verification') {
    throw new ApiError(HTTP.UNAUTHORIZED, otpService.INVALID_OTP);
  }

  await otpService.verifyOtp({ userId: user.user_id, purpose: 'registration', channel, code: otp });

  const verifiedColumn = channel === 'email' ? 'email_verified_at' : 'mobile_verified_at';
  await User.query()
    .where({ user_id: user.user_id, status: 'pending_verification' })
    .update({ status: 'active', [verifiedColumn]: new Date() });

  return { user_id: user.user_id, status: 'active' };
}

/* ---------------- Login: step 1 (credentials or OTP) ---------------- */

function verificationChallenge(verification) {
  return {
    requires_live_verification: true,
    verification_token: verification.token,
    verification_expires_in: verification.expiresIn,
  };
}

/**
 * Password login. Returns a verification challenge — NOT an access token.
 * @param {string} [requiredRole] e.g. 'admin' for the admin panel login
 */
async function loginWithPassword({ identifier, password }, { requiredRole } = {}) {
  const parsed = parseIdentifier(identifier);
  const user = parsed ? await User.findByContact(parsed.channel, parsed.value) : null;

  if (!user || !user.password_hash) {
    await verifyAgainstDummy(password);
    throw ApiError.unauthorized(MESSAGES.INVALID_CREDENTIALS);
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    throw ApiError.unauthorized(MESSAGES.INVALID_CREDENTIALS);
  }
  // Not revealing that the account exists but lacks the role.
  if (requiredRole && user.role !== requiredRole) throw ApiError.unauthorized(MESSAGES.INVALID_CREDENTIALS);

  assertCanLogin(user);
  return verificationChallenge(await verificationService.startVerification(user, 'password'));
}

async function sendLoginOtp({ identifier }) {
  const parsed = parseIdentifier(identifier);
  const user = parsed ? await User.findByContact(parsed.channel, parsed.value) : null;
  if (user && user.status === 'active') {
    await otpService.issueOtp({
      userId: user.user_id,
      purpose: 'login',
      channel: parsed.channel,
      destination: parsed.value,
    });
  }
  return { message: MESSAGES.OTP_SENT_GENERIC };
}

/** OTP login. Like password login, it only unlocks the live verification step. */
async function verifyLoginOtp({ identifier, otp }) {
  const parsed = parseIdentifier(identifier);
  const user = parsed ? await User.findByContact(parsed.channel, parsed.value) : null;
  if (!user) throw new ApiError(HTTP.UNAUTHORIZED, otpService.INVALID_OTP);

  await otpService.verifyOtp({ userId: user.user_id, purpose: 'login', channel: parsed.channel, code: otp });
  assertCanLogin(user);
  return verificationChallenge(await verificationService.startVerification(user, 'otp'));
}

/* ---------------- Login: step 2 (live presence) → final session ---------------- */

async function completeLoginVerification({ verification_token: token, ...detection }) {
  const verification = await verificationService.completeVerification(token, detection);

  const user = await User.findByPk(verification.user_id);
  if (!user) throw ApiError.unauthorized(verificationService.MESSAGES.INVALID_SESSION);
  assertCanLogin(user); // status may have changed since step 1

  const session = await getDb().transaction(async (trx) => {
    const created = await sessionService.createSession(
      user,
      { loginVerificationId: verification.verification_id },
      trx
    );
    await User.query(trx).where({ user_id: user.user_id }).update({ last_login_at: new Date() });
    return created;
  });

  return {
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.expiresIn,
    user: User.toPublic({ ...user, last_login_at: new Date() }),
  };
}

/* ---------------- Session ---------------- */

async function logout(sessionId) {
  await sessionService.revokeSession(sessionId);
}

function getCurrentUser(user) {
  return User.toPublic(user);
}

module.exports = {
  register,
  sendVerificationOtp,
  verifyAccountOtp,
  loginWithPassword,
  sendLoginOtp,
  verifyLoginOtp,
  completeLoginVerification,
  logout,
  getCurrentUser,
  MESSAGES,
};
