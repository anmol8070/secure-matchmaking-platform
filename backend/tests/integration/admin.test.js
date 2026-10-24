/**
 * Phase 14 — admin panel API: real HTTP + Socket.IO against a real database.
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;

const http = require('http');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const { attachSocketServer, closeSocketServer } = require('../../src/sockets');
const callService = require('../../src/services/callService');
const reportService = require('../../src/services/reportService');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');

jest.setTimeout(30000);

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';
const ONE_FACE = { face_detected: true, face_count: 1 };

let db;
let httpServer;
let io;
let baseUrl;
let seq = 0;
let admin;
const openSockets = [];

/* ---------------- helpers ---------------- */

const letterName = (n) => `Admin ${String.fromCharCode(65 + (Math.floor(n / 26) % 26))}${String.fromCharCode(97 + (n % 26))}`;

const as = (token) => ({
  get: (p) => request(httpServer).get(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body) => request(httpServer).post(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (p, body) => request(httpServer).put(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  delete: (p) => request(httpServer).delete(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
});

async function verifyLogin(path, identifier) {
  const login = await request(httpServer).post(`/api/v1${path}`).send({ identifier, password: PASSWORD });
  if (login.status !== 200) return { login };
  const done = await request(httpServer)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
  return { login, token: done.body.data.access_token };
}

async function member({ profile = true, mobile } = {}) {
  const email = `admin${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(httpServer).post('/api/v1/auth/register').send({ email, password: PASSWORD, ...(mobile && { mobile }) });
  await request(httpServer).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const { token } = await verifyLogin('/auth/login', email);
  const name = letterName(seq);
  if (profile) {
    expect((await as(token).post('/profile', { name, dateOfBirth: '1993-03-03', gender: 'male', city: 'Nashik' })).status).toBe(201);
  }
  return { userId: reg.body.data.user_id, email, token, api: as(token), name };
}

async function makeAdmin() {
  const user = await member();
  await db('users').where({ user_id: user.userId }).update({ role: 'admin' });
  const { token } = await verifyLogin('/admin/login', user.email);
  return { ...user, token, api: as(token) };
}

async function connect(a, b) {
  const sent = await a.api.post('/connections', { receiverId: b.userId });
  await b.api.put(`/connections/${sent.body.data.connection.id}`, { action: 'accept' });
}

function openSocket(token) {
  const socket = connectClient(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}
const emit = (socket, event, payload) => socket.timeout(4000).emitWithAck(event, payload);
const next = (socket, event, timeout = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const count = async (q) => Number((await q.count({ n: '*' }).first()).n);
const ADMIN_GETS = ['/admin/dashboard', '/admin/activity', '/admin/monitoring', '/admin/ml', '/admin/users', '/admin/users/1', '/admin/reports', '/admin/reports/1', '/admin/audit-logs'];

/* ---------------- setup ---------------- */

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
  httpServer = http.createServer(app);
  io = attachSocketServer(httpServer, { corsOrigins: [] });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  admin = await makeAdmin();
}, 60000);

afterEach(() => {
  callService.resetForTests();
  reportService.resetForTests();
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await closeSocketServer(io);
  await closeConnection();
});

/* ---------------- authentication & authorization ---------------- */

describe('admin authentication and authorization', () => {
  it('rejects anonymous requests (401) and ordinary users (403) on every admin API', async () => {
    const user = await member();
    for (const path of ADMIN_GETS) {
      expect({ path, status: (await request(httpServer).get(`/api/v1${path}`)).status }).toEqual({ path, status: 401 });
      expect({ path, status: (await user.api.get(path)).status }).toEqual({ path, status: 403 });
    }
    expect((await user.api.put(`/admin/users/${admin.userId}/status`, { status: 'suspended', reason: 'nope' })).status).toBe(403);
    expect((await user.api.put('/admin/reports/1/status', { status: 'resolved' })).status).toBe(403);
    expect((await user.api.post('/admin/ml/train')).status).toBe(403);
  });

  it('lets only admin accounts through the admin login, and admins reach every admin API', async () => {
    const user = await member();
    const { login } = await verifyLogin('/admin/login', user.email);
    expect(login.status).toBe(401);
    for (const path of ADMIN_GETS.filter((p) => !/\/1$/.test(p))) {
      expect({ path, status: (await admin.api.get(path)).status }).toEqual({ path, status: 200 });
    }
  });

  it('rejects forged, expired and logged-out sessions', async () => {
    const forged = jwt.sign({ user_id: admin.userId, role: 'admin', typ: 'access' }, 'wrong-secret', { jwtid: 'x', expiresIn: '1h' });
    expect((await as(forged).get('/admin/dashboard')).status).toBe(401);
    const expired = jwt.sign({ user_id: admin.userId, role: 'admin', typ: 'access' }, config.jwtSecret(), { jwtid: 'y', expiresIn: '-1s' });
    expect((await as(expired).get('/admin/dashboard')).status).toBe(401);

    const second = await verifyLogin('/admin/login', admin.email);
    await as(second.token).post('/auth/logout');
    expect((await as(second.token).get('/admin/dashboard')).status).toBe(401);
  });

  it('loses admin access as soon as the role is removed (role is read from the database)', async () => {
    const other = await makeAdmin();
    expect((await other.api.get('/admin/dashboard')).status).toBe(200);
    await db('users').where({ user_id: other.userId }).update({ role: 'user' });
    expect((await other.api.get('/admin/dashboard')).status).toBe(403);
  });
});

/* ---------------- dashboard & activity ---------------- */

describe('dashboard and activity', () => {
  it('reports real aggregate counts from the database', async () => {
    const [a, b] = [await member(), await member()];
    await connect(a, b);
    await a.api.post('/messages', { receiverId: b.userId, message: 'SECRET-MESSAGE-TEXT-42' });
    await a.api.post('/reports', { reportedUserId: b.userId, reason: 'spam' });

    const res = await admin.api.get('/admin/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.users.total).toBe(await count(db('users')));
    expect(d.users.active).toBe(await count(db('users').where({ status: 'active' })));
    expect(d.users.admins).toBe(await count(db('users').where({ role: 'admin' })));
    expect(d.reports.pending).toBe(await count(db('reports').where({ status: 'pending' })));
    expect(d.connections.active).toBe(await count(db('connection_requests').where({ status: 'accepted' })));
    expect(d.messages.total).toBe(await count(db('messages')));
    expect(d.calls.total).toBe(await count(db('video_calls')));
    expect(d.users.newInPeriod).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET-MESSAGE-TEXT-42|password|otp|token/i);
  });

  it('validates date filters and handles an empty period', async () => {
    for (const q of ['from=2026-13-01', 'from=yesterday', 'from=2026-10-10&to=2026-10-01', 'from=2020-01-01&to=2026-01-01']) {
      expect({ q, status: (await admin.api.get(`/admin/dashboard?${q}`)).status }).toEqual({ q, status: 422 });
    }
    const empty = (await admin.api.get('/admin/dashboard?from=2001-01-01&to=2001-01-31')).body.data;
    expect(empty).toMatchObject({ users: { newInPeriod: 0 }, reports: { submittedInPeriod: 0 }, messages: { inPeriod: 0 }, calls: { inPeriod: 0 } });
  });

  it('returns daily activity series with every day present', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const res = await admin.api.get(`/admin/activity?from=${weekAgo}&to=${today}`);
    expect(res.status).toBe(200);
    const { days, series, totals } = res.body.data;
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toBe(today);
    for (const name of ['registrations', 'connectionRequests', 'acceptedConnections', 'reportsSubmitted', 'reportsClosed', 'messages', 'calls']) {
      expect(series[name]).toHaveLength(7);
    }
    const start = new Date(`${weekAgo}T00:00:00Z`);
    expect(totals.registrations).toBe(await count(db('users').where('created_at', '>=', start)));
    expect(totals.messages).toBe(await count(db('messages').where('sent_at', '>=', start)));
  });

  it('reports platform health', async () => {
    const health = (await admin.api.get('/admin/monitoring')).body.data;
    expect(health).toMatchObject({ database: { reachable: true }, realtime: { socketServer: true, redisAdapter: false } });
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(health)).not.toMatch(/secret|password|DB_PASSWORD/i);
  });
});

/* ---------------- user management ---------------- */

describe('user management', () => {
  it('lists users with pagination, search and filters, without secrets', async () => {
    const u = await member({ mobile: `9${String(Date.now()).slice(-9)}` });
    const page1 = (await admin.api.get('/admin/users?limit=2&page=1')).body.data;
    const page2 = (await admin.api.get('/admin/users?limit=2&page=2')).body.data;
    expect(page1.users).toHaveLength(2);
    expect(page1.pagination).toMatchObject({ page: 1, limit: 2, total: await count(db('users')) });
    expect(page1.users.map((x) => x.userId)).not.toEqual(expect.arrayContaining(page2.users.map((x) => x.userId)));

    for (const search of [u.email.slice(0, 12), u.name, String(u.userId)]) {
      const found = (await admin.api.get(`/admin/users?search=${encodeURIComponent(search)}`)).body.data.users;
      expect(found.map((x) => x.userId)).toContain(u.userId);
    }
    expect((await admin.api.get('/admin/users?search=%25')).body.data.users.map((x) => x.userId)).not.toContain(u.userId); // "%" is literal

    const row = (await admin.api.get(`/admin/users?search=${encodeURIComponent(u.email)}`)).body.data.users[0];
    expect(row).toMatchObject({ userId: u.userId, email: u.email, name: u.name, status: 'active', role: 'user' });
    expect(row.mobile).toMatch(/^•+\d{3}$/);
    const suspendedOnly = (await admin.api.get('/admin/users?status=suspended&limit=100')).body.data.users;
    expect(suspendedOnly.every((x) => x.status === 'suspended')).toBe(true);
    expect(JSON.stringify(page1)).not.toMatch(/password|hash|otp|token|session/i);
  });

  it('rejects invalid list filters', async () => {
    for (const q of ['status=frozen', 'role=superadmin', 'limit=1000', 'limit=0', 'page=0', `search=${'x'.repeat(101)}`]) {
      expect({ q, status: (await admin.api.get(`/admin/users?${q}`)).status }).toEqual({ q, status: 422 });
    }
  });

  it('shows user details without secrets or private content', async () => {
    const [a, b] = [await member(), await member()];
    await connect(a, b);
    await a.api.post('/messages', { receiverId: b.userId, message: 'PRIVATE-DETAIL-TEXT' });
    await b.api.post('/reports', { reportedUserId: a.userId, reason: 'harassment', description: 'test' });

    const res = await admin.api.get(`/admin/users/${a.userId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      user: { userId: a.userId, email: a.email, status: 'active', role: 'user' },
      profile: { name: a.name, age: expect.any(Number), location: 'Nashik' },
      stats: { connections: 1, messagesSent: 1, reportsAgainst: { open: 1 } },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/PRIVATE-DETAIL-TEXT|password|hash|otp|token|session|1993-03-03/i);
    expect((await admin.api.get('/admin/users/999999999')).status).toBe(404);
    expect((await admin.api.get('/admin/users/abc')).status).toBe(422);
  });

  it('suspends an account everywhere at once and records it; reactivation restores sign-in', async () => {
    const [target, friend] = [await member(), await member()];
    await connect(target, friend);
    const [targetSocket, friendSocket] = [await openSocket(target.token), await openSocket(friend.token)];
    const incoming = next(friendSocket, 'call:incoming');
    await emit(targetSocket, 'call:initiate', { userId: friend.userId });
    const callId = (await incoming).call.id;
    await emit(friendSocket, 'call:accept', { callId });

    const dropped = new Promise((resolve) => targetSocket.once('disconnect', resolve));
    const callEnded = next(friendSocket, 'call:ended');
    const res = await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Repeated harassment' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('suspended');

    await dropped; // open socket closed
    expect((await callEnded).call).toMatchObject({ id: callId, endReason: 'account_suspended' });
    expect((await target.api.get('/profile')).status).toBe(401); // session revoked
    await expect(openSocket(target.token)).rejects.toThrow();
    expect((await verifyLogin('/auth/login', target.email)).login.status).toBe(403);
    expect((await friend.api.post('/messages', { receiverId: target.userId, message: 'hi' })).status).toBe(404);

    const audit = await db('admin_audit_logs').where({ target_type: 'user', target_id: target.userId }).orderBy('audit_id', 'desc').first();
    expect(audit).toMatchObject({ admin_id: admin.userId, action: 'user_suspended', reason: 'Repeated harassment' });

    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'active' })).status).toBe(200);
    expect((await verifyLogin('/auth/login', target.email)).login.status).toBe(200);
    expect(await db('admin_audit_logs').where({ target_id: target.userId, action: 'user_reactivated' })).toHaveLength(1);
  });

  it('enforces the status rules and safeguards', async () => {
    const target = await member();
    const otherAdmin = await makeAdmin();
    expect((await admin.api.put(`/admin/users/${admin.userId}/status`, { status: 'suspended', reason: 'oops' })).status).toBe(400);
    expect((await admin.api.put(`/admin/users/${otherAdmin.userId}/status`, { status: 'suspended', reason: 'nope' })).status).toBe(403);
    expect((await admin.api.put('/admin/users/999999999/status', { status: 'suspended', reason: 'none' })).status).toBe(404);
    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended' })).status).toBe(422); // reason required
    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'banned', reason: 'x' })).status).toBe(422);
    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'active' })).status).toBe(409); // already active
    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Spam', role: 'admin' })).status).toBe(422);

    // Two admins suspending at the same time: one wins, the other gets 409.
    const [r1, r2] = await Promise.all([
      admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Spam one' }),
      otherAdmin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Spam two' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(await db('admin_audit_logs').where({ target_id: target.userId, action: 'user_suspended' })).toHaveLength(1);
  });

  it('links a suspension to the report it came from', async () => {
    const [reporter, target, other] = [await member(), await member(), await member()];
    const report = (await reporter.api.post('/reports', { reportedUserId: target.userId, reason: 'threatening' })).body.data.report;
    const wrong = (await reporter.api.post('/reports', { reportedUserId: other.userId, reason: 'spam' })).body.data.report;
    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Threats', reportId: wrong.id })).status).toBe(422);
    expect((await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Threats', reportId: report.id })).status).toBe(200);
    const audit = await db('admin_audit_logs').where({ target_id: target.userId, action: 'user_suspended' }).first();
    expect(JSON.parse(typeof audit.metadata === 'string' ? audit.metadata : JSON.stringify(audit.metadata))).toMatchObject({ from: 'active', to: 'suspended', reportId: report.id });
  });
});

/* ---------------- reports ---------------- */

describe('report moderation', () => {
  it('lists reports with filters and pagination, and shows details with history', async () => {
    const [reporter, target] = [await member(), await member()];
    const filed = (await reporter.api.post('/reports', { reportedUserId: target.userId, reason: 'fake_profile', description: 'Uses stolen photos.' })).body.data.report;

    const list = (await admin.api.get(`/admin/reports?status=pending&reportedUserId=${target.userId}`)).body.data;
    expect(list.reports).toEqual([
      expect.objectContaining({
        id: filed.id,
        status: 'pending',
        reason: 'fake_profile',
        description: 'Uses stolen photos.',
        reporter: expect.objectContaining({ userId: reporter.userId, email: reporter.email }),
        reportedUser: expect.objectContaining({ userId: target.userId, status: 'active' }),
        reportedUserOpenReports: 1,
      }),
    ]);
    const paged = (await admin.api.get('/admin/reports?limit=1&sort=newest')).body.data;
    expect(paged.reports).toHaveLength(1);
    expect(paged.pagination.total).toBe(await count(db('reports')));
    for (const q of ['status=open', 'reason=rude', 'limit=500', 'sort=random']) {
      expect({ q, status: (await admin.api.get(`/admin/reports?${q}`)).status }).toEqual({ q, status: 422 });
    }

    const detail = (await admin.api.get(`/admin/reports/${filed.id}`)).body.data.report;
    expect(detail).toMatchObject({ id: filed.id, reasonLabel: 'Fake or misleading profile', history: [] });
    expect((await admin.api.get('/admin/reports/999999999')).status).toBe(404);
  });

  it('validates transitions, records reviewer and audit, and never touches the account', async () => {
    const [reporter, target] = [await member(), await member()];
    const filed = (await reporter.api.post('/reports', { reportedUserId: target.userId, reason: 'spam' })).body.data.report;

    expect((await admin.api.put(`/admin/reports/${filed.id}/status`, { status: 'pending' })).status).toBe(422);
    const review = await admin.api.put(`/admin/reports/${filed.id}/status`, { status: 'under_review' });
    expect(review.status).toBe(200);
    expect(review.body.data.report).toMatchObject({ status: 'under_review', reviewedBy: admin.userId });

    const resolved = await admin.api.put(`/admin/reports/${filed.id}/status`, { status: 'resolved', actionTaken: 'warning', resolutionNote: 'User warned.' });
    expect(resolved.body.data.report).toMatchObject({ status: 'resolved', actionTaken: 'warning', resolutionNote: 'User warned.' });
    expect(resolved.body.data.report.history.map((h) => h.metadata.to)).toEqual(['under_review', 'resolved']);

    expect((await admin.api.put(`/admin/reports/${filed.id}/status`, { status: 'dismissed' })).status).toBe(409);
    expect((await admin.api.put(`/admin/reports/${filed.id}/status`, { status: 'resolved', actionTaken: 'banned' })).status).toBe(422);
    expect((await admin.api.put('/admin/reports/999999999/status', { status: 'resolved' })).status).toBe(404);
    expect((await db('users').where({ user_id: target.userId }).first()).status).toBe('active');
    expect((await reporter.api.get('/reports')).body.data.reports[0].state).toBe('closed');
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const [reporter, target] = [await member(), await member()];
    const other = await makeAdmin();
    const filed = (await reporter.api.post('/reports', { reportedUserId: target.userId, reason: 'spam' })).body.data.report;
    const [r1, r2] = await Promise.all([
      admin.api.put(`/admin/reports/${filed.id}/status`, { status: 'resolved' }),
      other.api.put(`/admin/reports/${filed.id}/status`, { status: 'dismissed' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect(await db('admin_audit_logs').where({ target_type: 'report', target_id: filed.id })).toHaveLength(1);
  });
});

/* ---------------- audit log & ML ---------------- */

describe('audit log and ML monitoring', () => {
  it('lists audit entries without secrets and offers no way to change them', async () => {
    const target = await member();
    await admin.api.put(`/admin/users/${target.userId}/status`, { status: 'suspended', reason: 'Audit check' });
    const res = await admin.api.get(`/admin/audit-logs?targetType=user&targetId=${target.userId}`);
    expect(res.body.data.entries).toEqual([
      expect.objectContaining({ adminId: admin.userId, adminEmail: admin.email, action: 'user_suspended', targetType: 'user', targetId: target.userId, reason: 'Audit check', metadata: { from: 'active', to: 'suspended' } }),
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/password|otp|token|session|hash/i);
    expect((await admin.api.get('/admin/audit-logs?action=deleted_everything')).status).toBe(422);
    expect((await admin.api.delete('/admin/audit-logs/1')).status).toBe(404);
    expect((await admin.api.put('/admin/audit-logs/1', { reason: 'x' })).status).toBe(404);
  });

  it('reports ML status honestly from stored metadata only', async () => {
    await db('ml_model_versions').del();
    let ml = (await admin.api.get('/admin/ml')).body.data;
    expect(ml).toMatchObject({ status: 'not_trained', activeModel: null, models: [], baseline: null });
    expect(ml.message).toMatch(/not yet trained/);

    await db('ml_model_versions').insert({
      model_version: 'lr-test-1',
      model_type: 'logistic_regression',
      feature_version: 'v1',
      training_samples: 12,
      positive_samples: 7,
      negative_samples: 5,
      precision: 0.75,
      recall: 0.6,
      f1_score: 0.6667,
      roc_auc: 0.7,
      weights: JSON.stringify({ bias: 0.1, compatibility_score: 1.2 }),
      status: 'active',
    });
    ml = (await admin.api.get('/admin/ml')).body.data;
    expect(ml.status).toBe('insufficient_data');
    expect(ml.activeModel).toMatchObject({ version: 'lr-test-1', trainingSamples: 12, metrics: { precision: 0.75, recall: 0.6, rocAuc: 0.7, precisionAtK: null } });
    expect(JSON.stringify(ml)).not.toMatch(/weights|bias|compatibility_score/);
    expect(ml.interactions.byAction).toEqual(expect.any(Object));
    await db('ml_model_versions').where({ model_version: 'lr-test-1' }).del();
  });
});
