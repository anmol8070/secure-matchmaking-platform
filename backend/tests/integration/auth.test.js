/**
 * Phase 4 authentication integration tests — real HTTP requests against the
 * app and a real database (DB_TEST_DATABASE). OTP codes are read from the
 * development outbox (the dev provider), exactly as a developer would.
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB; // before the app loads the shared connection

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';
const NOT_IMPLEMENTED = { success: false, message: 'This module will be implemented in a later development phase' };

let db;
let seq = 0;

/* ---------------- helpers ---------------- */

const uniqueEmail = () => `auth${(seq += 1)}_${Date.now()}@example.com`;
const uniqueMobile = () => `9${String(Date.now() + (seq += 1)).slice(-9)}`;

const post = (path, body, token) => {
  const req = request(app).post(`/api/v1${path}`).send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const get = (path, token) => {
  const req = request(app).get(`/api/v1${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

const outboxCode = (destination) => devOutbox.peek(destination)?.code;
const userByEmail = (email) => db('users').where({ email }).first();

/** Lets the next OTP request bypass the resend cooldown. */
const ageOtps = (userId) =>
  db('otp_codes').where({ user_id: userId }).update({ created_at: new Date(Date.now() - 2 * 60 * 1000) });

async function registerAndVerify({ email = uniqueEmail(), mobile, password = PASSWORD } = {}) {
  const res = await post('/auth/register', { email, mobile, password });
  expect(res.status).toBe(201);
  const verified = await post('/auth/verify-otp', { email, otp: outboxCode(email) });
  expect(verified.status).toBe(200);
  return { email, mobile, userId: res.body.data.user_id };
}

async function startLogin(identifier, password = PASSWORD) {
  const res = await post('/auth/login', { identifier, password });
  expect(res.status).toBe(200);
  return res.body.data.verification_token;
}

const ONE_FACE = { face_detected: true, face_count: 1, confidence: 0.97, detector: 'mediapipe-blazeface' };

async function fullLogin(identifier, password = PASSWORD) {
  const token = await startLogin(identifier, password);
  const res = await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE });
  expect(res.status).toBe(200);
  return res.body.data.access_token;
}

/* ---------------- setup ---------------- */

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
}, 60000);

afterAll(async () => {
  await closeConnection();
});

/* ---------------- registration ---------------- */

describe('registration', () => {
  it('registers a user as pending_verification and sends an OTP', async () => {
    const email = uniqueEmail();
    const mobile = uniqueMobile();
    const res = await post('/auth/register', { email: email.toUpperCase(), mobile, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: 'Registration successful. OTP sent for verification.',
      data: {
        user_id: expect.any(Number),
        otp_required: true,
        otp_channel: 'email',
        otp_destination: expect.stringMatching(/^au\*+@example\.com$/),
      },
    });

    const user = await userByEmail(email); // stored lower-case
    expect(user).toMatchObject({ status: 'pending_verification', role: 'user', mobile: `+91${mobile}` });
    expect(user.password_hash).toMatch(/^scrypt\$/);
    expect(user.password_hash).not.toContain(PASSWORD);

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password|hash|otp_code|"\d{6}"/i);
    expect(outboxCode(email)).toMatch(/^\d{6}$/);
  });

  it('registers with a mobile number only', async () => {
    const mobile = uniqueMobile();
    const res = await post('/auth/register', { mobile, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data.otp_channel).toBe('mobile');
    expect(outboxCode(`+91${mobile}`)).toMatch(/^\d{6}$/);
  });

  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: PASSWORD });
    const res = await post('/auth/register', { email, password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.errors).toEqual([{ field: 'body.email', message: 'This email is already registered' }]);
  });

  it('rejects a duplicate mobile with 409 (in any format)', async () => {
    const mobile = uniqueMobile();
    await post('/auth/register', { email: uniqueEmail(), mobile, password: PASSWORD });
    const res = await post('/auth/register', { email: uniqueEmail(), mobile: `+91 ${mobile}`, password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.errors).toEqual([{ field: 'body.mobile', message: 'This mobile number is already registered' }]);
  });

  it.each([
    [{ password: PASSWORD }, 'Email or mobile number is required'],
    [{ email: 'not-an-email', password: PASSWORD }, 'Enter a valid email address'],
    [{ email: 'weak@example.com', password: 'weak' }, 'Password must be at least 8 characters'],
    [{ email: 'weak@example.com', password: '12345678' }, 'Password must contain a letter'],
  ])('rejects %j with 422', async (body, message) => {
    const res = await post('/auth/register', body);
    expect(res.status).toBe(422);
    expect(res.body.errors.map((e) => e.message)).toContain(message);
  });
});

/* ---------------- account OTP ---------------- */

describe('account verification OTP', () => {
  it('stores only an HMAC hash of the OTP with expiry', async () => {
    const email = uniqueEmail();
    const { body } = await post('/auth/register', { email, password: PASSWORD });
    const code = outboxCode(email);
    const otp = await db('otp_codes').where({ user_id: body.data.user_id }).first();

    expect(otp).toMatchObject({ purpose: 'registration', channel: 'email', status: 'active', attempts: 0 });
    expect(otp.otp_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(otp.otp_hash).not.toContain(code);
    const minutes = (new Date(otp.expires_at) - new Date(otp.created_at)) / 60000;
    expect(minutes).toBeCloseTo(config.otp.expiryMinutes, 0);
  });

  it('activates the account with a valid OTP', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: PASSWORD });
    const res = await post('/auth/verify-otp', { email, otp: outboxCode(email) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Account verified. You can now log in.' });
    const user = await userByEmail(email);
    expect(user.status).toBe('active');
    expect(user.email_verified_at).toBeInstanceOf(Date);
    const otp = await db('otp_codes').where({ user_id: user.user_id }).first();
    expect(otp.status).toBe('verified');
  });

  it('rejects a wrong OTP generically and counts the attempt', async () => {
    const email = uniqueEmail();
    const { body } = await post('/auth/register', { email, password: PASSWORD });
    const wrong = outboxCode(email) === '000000' ? '111111' : '000000';
    const res = await post('/auth/verify-otp', { email, otp: wrong });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Invalid or expired OTP' });
    expect((await db('otp_codes').where({ user_id: body.data.user_id }).first()).attempts).toBe(1);
  });

  it('rejects an expired OTP with the same message', async () => {
    const email = uniqueEmail();
    const { body } = await post('/auth/register', { email, password: PASSWORD });
    await db('otp_codes').where({ user_id: body.data.user_id }).update({ expires_at: new Date(Date.now() - 1000) });

    const res = await post('/auth/verify-otp', { email, otp: outboxCode(email) });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Invalid or expired OTP' });
  });

  it('invalidates the OTP after the maximum attempts, even for the right code', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: PASSWORD });
    const code = outboxCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < config.otp.maxAttempts; i += 1) {
      expect((await post('/auth/verify-otp', { email, otp: wrong })).status).toBe(401);
    }
    const res = await post('/auth/verify-otp', { email, otp: code });
    expect(res.status).toBe(401);
    expect((await userByEmail(email)).status).toBe('pending_verification');
  });

  it('does not accept a used OTP again', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: PASSWORD });
    const code = outboxCode(email);
    expect((await post('/auth/verify-otp', { email, otp: code })).status).toBe(200);

    const reuse = await post('/auth/verify-otp', { email, otp: code });
    expect(reuse.status).toBe(401);
    expect(reuse.body.message).toBe('Invalid or expired OTP');
  });

  it('resends a new OTP that replaces the previous one', async () => {
    const email = uniqueEmail();
    const { body } = await post('/auth/register', { email, password: PASSWORD });
    const first = outboxCode(email);
    await ageOtps(body.data.user_id);

    const res = await post('/auth/send-otp', { email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If the account exists, an OTP has been sent.');
    const second = outboxCode(email);

    const rows = await db('otp_codes').where({ user_id: body.data.user_id }).orderBy('otp_id');
    expect(rows.map((r) => r.status)).toEqual(['invalidated', 'active']);
    if (first !== second) expect((await post('/auth/verify-otp', { email, otp: first })).status).toBe(401);
    expect((await post('/auth/verify-otp', { email, otp: second })).status).toBe(200);
  });

  it('limits resend frequency (cooldown) and hourly volume', async () => {
    const email = uniqueEmail();
    const { body } = await post('/auth/register', { email, password: PASSWORD });

    const tooSoon = await post('/auth/send-otp', { email });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.message).toMatch(/^Please wait \d+ seconds before requesting another OTP$/);

    for (let i = 1; i < config.otp.maxSendsPerHour; i += 1) {
      await ageOtps(body.data.user_id);
      expect((await post('/auth/send-otp', { email })).status).toBe(200);
    }
    await ageOtps(body.data.user_id);
    const capped = await post('/auth/send-otp', { email });
    expect(capped.status).toBe(429);
    expect(capped.body.message).toBe('Too many OTP requests. Please try again later.');
  });

  it('gives the same response for unknown and already-active accounts, without sending', async () => {
    const { email } = await registerAndVerify();
    const unknown = await post('/auth/send-otp', { email: 'nobody@example.com' });
    const active = await post('/auth/send-otp', { email });

    for (const res of [unknown, active]) {
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('If the account exists, an OTP has been sent.');
    }
    expect(outboxCode('nobody@example.com')).toBeUndefined();
  });

  it('exposes codes through the dev outbox route outside production only', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: PASSWORD });
    const res = await get(`/dev/otp?destination=${encodeURIComponent(email)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: outboxCode(email), purpose: 'registration', channel: 'email' });
  });
});

/* ---------------- login ---------------- */

describe('login (step 1: credentials)', () => {
  it('verifies credentials and returns a verification challenge — not an access token', async () => {
    const { email } = await registerAndVerify();
    const res = await post('/auth/login', { identifier: email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Credentials verified. Live verification required.',
      data: {
        requires_live_verification: true,
        verification_token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        verification_expires_in: config.loginVerification.expiryMinutes * 60,
      },
    });
    expect(res.body.data.access_token).toBeUndefined();

    // The temporary token cannot be used as an access token.
    const me = await get('/auth/me', res.body.data.verification_token);
    expect(me.status).toBe(401);
  });

  it('logs in with the mobile number', async () => {
    const mobile = uniqueMobile();
    await registerAndVerify({ mobile });
    const res = await post('/auth/login', { identifier: mobile, password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password and an unknown user with the same message', async () => {
    const { email } = await registerAndVerify();
    const wrong = await post('/auth/login', { identifier: email, password: 'Wrong1234' });
    const unknown = await post('/auth/login', { identifier: 'ghost@example.com', password: PASSWORD });

    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, message: 'Invalid credentials' });
    }
  });

  it('asks unverified users to verify first (only after the right password)', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: PASSWORD });

    const wrong = await post('/auth/login', { identifier: email, password: 'Wrong1234' });
    expect(wrong.status).toBe(401);

    const res = await post('/auth/login', { identifier: email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Please verify your account with the OTP sent to you before logging in.');
  });

  it.each(['banned', 'suspended', 'deactivated', 'deleted'])('blocks %s accounts with a generic message', async (status) => {
    const { email, userId } = await registerAndVerify();
    await db('users').where({ user_id: userId }).update({ status });

    const res = await post('/auth/login', { identifier: email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'This account cannot sign in. Please contact support.' });
  });
});

describe('login with OTP', () => {
  it('sends a login OTP and returns a verification challenge after verifying it', async () => {
    const { email } = await registerAndVerify();
    const sent = await post('/auth/login/send-otp', { identifier: email });
    expect(sent.status).toBe(200);
    expect(sent.body.message).toBe('If the account exists, an OTP has been sent.');
    expect(devOutbox.peek(email).purpose).toBe('login');

    const res = await post('/auth/login/verify-otp', { identifier: email, otp: outboxCode(email) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ requires_live_verification: true, verification_token: expect.any(String) });
    expect(res.body.data.access_token).toBeUndefined();

    const row = await db('login_verifications').orderBy('verification_id', 'desc').first();
    expect(row).toMatchObject({ auth_method: 'otp', verification_status: 'pending' });
  });

  it('rejects a wrong login OTP and does not send OTPs to unknown or pending accounts', async () => {
    const { email } = await registerAndVerify();
    await post('/auth/login/send-otp', { identifier: email });
    const wrong = outboxCode(email) === '000000' ? '111111' : '000000';
    const res = await post('/auth/login/verify-otp', { identifier: email, otp: wrong });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired OTP');

    const pending = uniqueEmail();
    await post('/auth/register', { email: pending, password: PASSWORD });
    const registrationCode = outboxCode(pending);
    expect((await post('/auth/login/send-otp', { identifier: pending })).status).toBe(200);
    expect(devOutbox.peek(pending).purpose).toBe('registration');
    // A registration code is not a login code.
    expect((await post('/auth/login/verify-otp', { identifier: pending, otp: registrationCode })).status).toBe(401);
  });
});

/* ---------------- live verification ---------------- */

describe('live human/face presence verification (step 2)', () => {
  it('asks to retake the photo when no face is detected, keeping the session open', async () => {
    const { email } = await registerAndVerify();
    const token = await startLogin(email);
    const res = await post('/auth/login-verification/complete', { verification_token: token, face_detected: false, face_count: 0 });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ success: false, message: 'No face detected. Please take the photo again.' });
    const row = await db('login_verifications').where({ verification_status: 'pending' }).orderBy('verification_id', 'desc').first();
    expect(row.attempt_count).toBe(1);

    const retry = await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE });
    expect(retry.status).toBe(200);
  });

  it('rejects multiple faces', async () => {
    const { email } = await registerAndVerify();
    const token = await startLogin(email);
    const res = await post('/auth/login-verification/complete', { verification_token: token, face_detected: true, face_count: 2 });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ success: false, message: 'Multiple faces detected. Please ensure only one person is visible.' });
  });

  it('completes login with exactly one face and issues the access token', async () => {
    const { email, userId } = await registerAndVerify();
    const token = await startLogin(email);
    const res = await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Login verification successful',
      data: {
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: 86400,
        user: { user_id: userId, email, role: 'user', status: 'active' },
      },
    });
    expect(res.body.data.user.password_hash).toBeUndefined();

    // Only the detector outcome is stored — no image or biometric data.
    const row = await db('login_verifications').where({ user_id: userId }).first();
    const result = typeof row.detection_result === 'string' ? JSON.parse(row.detection_result) : row.detection_result;
    expect(row.verification_status).toBe('passed');
    expect(result).toEqual({ ...ONE_FACE, outcome: 'passed' });

    // The session links back to the verification that completed the login.
    const session = await db('user_sessions').where({ user_id: userId }).first();
    expect(session.login_verification_id).toBe(row.verification_id);
    expect((await userByEmail(email)).last_login_at).toBeInstanceOf(Date);
  });

  it('rejects an expired verification session', async () => {
    const { email, userId } = await registerAndVerify();
    const token = await startLogin(email);
    await db('login_verifications').where({ user_id: userId }).update({ expires_at: new Date(Date.now() - 1000) });

    const res = await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired verification session. Please log in again.');
    expect((await db('login_verifications').where({ user_id: userId }).first()).verification_status).toBe('expired');
  });

  it('rejects an invalid token and verification without prior authentication', async () => {
    const res = await post('/auth/login-verification/complete', { verification_token: 'x'.repeat(43), ...ONE_FACE });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired verification session. Please log in again.');
  });

  it('does not accept a verification token twice', async () => {
    const { email } = await registerAndVerify();
    const token = await startLogin(email);
    expect((await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE })).status).toBe(200);
    expect((await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE })).status).toBe(401);
  });

  it('fails the session after too many unsuccessful attempts', async () => {
    const { email } = await registerAndVerify();
    const token = await startLogin(email);
    const noFace = { verification_token: token, face_detected: false, face_count: 0 };
    for (let i = 1; i < config.loginVerification.maxAttempts; i += 1) {
      expect((await post('/auth/login-verification/complete', noFace)).status).toBe(422);
    }
    const last = await post('/auth/login-verification/complete', noFace);
    expect(last.status).toBe(429);
    expect(last.body.message).toBe('Too many verification attempts. Please log in again.');
    expect((await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE })).status).toBe(401);
  });

  it('refuses to finish login if the account was suspended after step 1', async () => {
    const { email, userId } = await registerAndVerify();
    const token = await startLogin(email);
    await db('users').where({ user_id: userId }).update({ status: 'suspended' });

    const res = await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE });
    expect(res.status).toBe(403);
    expect(await db('user_sessions').where({ user_id: userId }).first()).toBeUndefined();
  });

  describe('profile picture is independent of login verification', () => {
    it.each([
      ['no profile at all', null],
      ['a profile without a picture', { profile_photo_url: null }],
      ['a profile picture of someone else', { profile_photo_url: 'https://cdn.example.com/photos/another-person.jpg' }],
      ['a profile picture with no face (a landscape)', { profile_photo_url: 'https://cdn.example.com/photos/mountains.jpg' }],
    ])('login verification passes with %s', async (label, profile) => {
      const { email, userId } = await registerAndVerify();
      if (profile) await db('profiles').insert({ user_id: userId, name: 'Test User', ...profile });

      const token = await startLogin(email);
      const res = await post('/auth/login-verification/complete', { verification_token: token, ...ONE_FACE });
      expect(res.status).toBe(200);
    });
  });
});

/* ---------------- authorization ---------------- */

describe('authentication and authorization middleware', () => {
  let user;
  let userToken;

  beforeAll(async () => {
    user = await registerAndVerify();
    userToken = await fullLogin(user.email);
  });

  it('accepts a valid JWT and returns the current user without secrets', async () => {
    const res = await get('/auth/me', userToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      user_id: user.userId,
      email: user.email,
      mobile: null,
      role: 'user',
      status: 'active',
      email_verified_at: expect.any(String),
      mobile_verified_at: null,
      last_login_at: expect.any(String),
      created_at: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|otp/i);
  });

  it('puts only non-sensitive claims in the JWT', () => {
    const payload = jwt.decode(userToken);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'jti', 'role', 'typ', 'user_id']);
    expect(payload).toMatchObject({ user_id: user.userId, role: 'user', typ: 'access' });
  });

  it('rejects a missing, tampered or expired JWT with 401', async () => {
    const missing = await get('/auth/me');
    expect(missing.status).toBe(401);

    const [h, p] = userToken.split('.');
    const tampered = await get('/auth/me', `${h}.${p}.invalidsignatureinvalidsignature`);
    expect(tampered.status).toBe(401);
    expect(tampered.body.message).toBe('Invalid or expired token');

    const { jti } = jwt.decode(userToken);
    const expired = jwt.sign(
      { user_id: user.userId, role: 'user', typ: 'access', exp: Math.floor(Date.now() / 1000) - 60 },
      config.jwtSecret(),
      { jwtid: jti }
    );
    const res = await get('/auth/me', expired);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired token');
  });

  it('rejects a correctly signed token that has no server-side session', async () => {
    const forged = jwt.sign({ user_id: user.userId, role: 'admin', typ: 'access' }, config.jwtSecret(), {
      jwtid: 'not-a-real-session',
      expiresIn: '1h',
    });
    const res = await get('/admin/users', forged);
    expect(res.status).toBe(401);
  });

  it('lets users reach user-protected APIs (placeholders return 501)', async () => {
    const res = await get('/profile', userToken);
    expect(res.status).toBe(501);
    expect(res.body).toEqual(NOT_IMPLEMENTED);
  });

  it('forbids users from admin APIs with 403', async () => {
    const res = await get('/admin/users', userToken);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'You do not have permission to perform this action' });
  });

  it('lets admins log in through /admin/login (with live verification) and reach admin APIs', async () => {
    const admin = await registerAndVerify();
    // Non-admins get the same answer as wrong credentials on the admin login.
    const denied = await post('/admin/login', { identifier: admin.email, password: PASSWORD });
    expect(denied.status).toBe(401);
    expect(denied.body.message).toBe('Invalid credentials');

    await db('users').where({ user_id: admin.userId }).update({ role: 'admin' });
    const login = await post('/admin/login', { identifier: admin.email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.requires_live_verification).toBe(true);

    const done = await post('/auth/login-verification/complete', {
      verification_token: login.body.data.verification_token,
      ...ONE_FACE,
    });
    expect(done.body.data.user.role).toBe('admin');

    const res = await get('/admin/users', done.body.data.access_token);
    expect(res.status).toBe(501);
    expect(res.body).toEqual(NOT_IMPLEMENTED);
  });

  it('blocks an existing session as soon as the account is suspended', async () => {
    const other = await registerAndVerify();
    const token = await fullLogin(other.email);
    await db('users').where({ user_id: other.userId }).update({ status: 'suspended' });

    const res = await get('/auth/me', token);
    expect(res.status).toBe(403);
  });
});

/* ---------------- logout ---------------- */

describe('logout', () => {
  it('revokes the session so the token stops working immediately', async () => {
    const { email, userId } = await registerAndVerify();
    const token = await fullLogin(email);
    const otherDevice = await fullLogin(email);

    const res = await post('/auth/logout', {}, token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Logged out successfully', data: {} });

    const after = await get('/auth/me', token);
    expect(after.status).toBe(401);
    expect(after.body.message).toBe('Session has expired or been revoked. Please log in again.');
    expect((await post('/auth/logout', {}, token)).status).toBe(401);

    // Other sessions of the same user are unaffected.
    expect((await get('/auth/me', otherDevice)).status).toBe(200);
    const sessions = await db('user_sessions').where({ user_id: userId }).orderBy('session_id');
    expect(sessions.map((s) => s.revoked_at !== null)).toEqual([true, false]);
  });

  it('rejects logout without a valid token', async () => {
    expect((await post('/auth/logout', {})).status).toBe(401);
    expect((await post('/auth/logout', {}, 'aaa.bbb.ccc')).status).toBe(401);
  });
});
