/**
 * Phase 13 — privacy settings, blocking and reporting: real HTTP + real
 * Socket.IO against a real database.
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;

const http = require('http');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const { attachSocketServer, closeSocketServer } = require('../../src/sockets');
const reportService = require('../../src/services/reportService');
const callService = require('../../src/services/callService');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');

// Several tests score full recommendation lists (every member in the shared test DB).
jest.setTimeout(30000);

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';
const ONE_FACE = { face_detected: true, face_count: 1 };

let db;
let httpServer;
let io;
let baseUrl;
let seq = 0;
const openSockets = [];

/* ---------------- helpers ---------------- */

const letterName = (n) => `Privacy ${String.fromCharCode(65 + (Math.floor(n / 26) % 26))}${String.fromCharCode(97 + (n % 26))}`;

const as = (token) => ({
  get: (p) => request(httpServer).get(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body) => request(httpServer).post(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (p, body) => request(httpServer).put(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  patch: (p, body) => request(httpServer).patch(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  delete: (p) => request(httpServer).delete(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
});

const PROFILE = {
  dateOfBirth: '1994-04-04',
  gender: 'female',
  city: 'Satara',
  state: 'Maharashtra',
  country: 'India',
  education: 'B.Tech',
  occupation: 'Architect',
  lifestyle: 'Active',
  bio: 'Enjoys long walks.',
};

async function member(overrides = {}) {
  const email = `privacy${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(httpServer).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  await request(httpServer).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const login = await request(httpServer).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
  const done = await request(httpServer)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
  const token = done.body.data.access_token;
  const api = as(token);
  const name = letterName(seq);
  expect((await api.post('/profile', { ...PROFILE, name, ...overrides })).status).toBe(201);
  return { userId: reg.body.data.user_id, email, token, api, name };
}

async function connect(a, b) {
  const sent = await a.api.post('/connections', { receiverId: b.userId });
  const id = sent.body.data.connection.id;
  await b.api.put(`/connections/${id}`, { action: 'accept' });
  return id;
}

async function giveHobby(user, name = 'Trekking') {
  let hobby = await db('hobbies').where({ hobby_name: name }).first();
  if (!hobby) {
    const [id] = await db('hobbies').insert({ hobby_name: name });
    hobby = { hobby_id: id };
  }
  await db('user_hobbies').insert({ user_id: user.userId, hobby_id: hobby.hobby_id });
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
function next(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
function silence(socket, event, ms = 400) {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected ${event}`));
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
}

/** The target's recommendation item for the viewer, searching every page (the test DB is shared by suites). */
const matchFor = async (viewer, target, query = '') => {
  for (let page = 1; ; page += 1) {
    const res = await viewer.api.get(`/matches?limit=100&page=${page}${query}`);
    expect(res.status).toBe(200);
    const found = res.body.data.recommendations.find((r) => r.userId === target.userId);
    if (found) return found;
    if (page >= res.body.data.pagination.totalPages) return undefined;
  }
};
const privacy = (user, settings) => user.api.put('/privacy/settings', settings);

/* ---------------- setup ---------------- */

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
  // Recommendations are only computed among active members with profiles; start clean so
  // pages stay small and deterministic.
  httpServer = http.createServer(app);
  io = attachSocketServer(httpServer, { corsOrigins: [] });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
}, 60000);

afterEach(() => {
  reportService.resetForTests();
  callService.resetForTests();
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await closeSocketServer(io);
  await closeConnection();
});

/* ---------------- privacy settings ---------------- */

describe('privacy settings API', () => {
  it('requires authentication', async () => {
    expect((await request(httpServer).get('/api/v1/privacy/settings')).status).toBe(401);
    expect((await request(httpServer).put('/api/v1/privacy/settings').send({ bioVisibility: 'nobody' })).status).toBe(401);
  });

  it('returns safe defaults, then saves changes for the authenticated user only', async () => {
    const [a, b] = [await member(), await member()];
    const defaults = (await a.api.get('/privacy/settings')).body.data;
    expect(defaults.settings).toEqual({
      profileVisibility: 'everyone',
      photoVisibility: 'everyone',
      ageVisibility: 'everyone',
      locationVisibility: 'everyone',
      educationVisibility: 'everyone',
      occupationVisibility: 'everyone',
      lifestyleVisibility: 'everyone',
      bioVisibility: 'everyone',
      hobbiesVisibility: 'everyone',
      onlineStatusVisibility: 'connections',
    });
    expect(defaults.options.profileVisibility).toEqual(['everyone', 'connections']);

    const saved = await privacy(a, { locationVisibility: 'nobody', educationVisibility: 'connections' });
    expect(saved.status).toBe(200);
    expect(saved.body.data.settings).toMatchObject({ locationVisibility: 'nobody', educationVisibility: 'connections', bioVisibility: 'everyone' });
    expect((await b.api.get('/privacy/settings')).body.data.settings.locationVisibility).toBe('everyone');
  });

  it('rejects other users, unknown settings and invalid values', async () => {
    const [a, b] = [await member(), await member()];
    for (const body of [
      { userId: b.userId, locationVisibility: 'nobody' },
      { user_id: b.userId },
      { favouriteColour: 'everyone' },
      { locationVisibility: 'friends' },
      { profileVisibility: 'nobody' },
      {},
    ]) {
      const res = await privacy(a, body);
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    }
    expect((await b.api.get('/privacy/settings')).body.data.settings.locationVisibility).toBe('everyone');
  });
});

/* ---------------- privacy enforcement ---------------- */

describe('privacy enforcement', () => {
  it('filters profile fields by viewer: members, connections, the owner', async () => {
    const [owner, viewer] = [await member(), await member()];
    await giveHobby(owner);
    await privacy(owner, { locationVisibility: 'nobody', educationVisibility: 'connections', hobbiesVisibility: 'connections' });

    const asMember = (await viewer.api.get(`/profile/${owner.userId}`)).body.data;
    expect(asMember).toMatchObject({ userId: owner.userId, name: owner.name, location: null, education: null, hobbies: null, occupation: 'Architect', restricted: false });
    expect(asMember.hiddenFields.sort()).toEqual(['education', 'hobbies', 'location']);

    await connect(viewer, owner);
    const asConnection = (await viewer.api.get(`/profile/${owner.userId}`)).body.data;
    expect(asConnection).toMatchObject({ location: null, education: 'B.Tech', hobbies: ['Trekking'] });

    const own = (await owner.api.get(`/profile/${owner.userId}`)).body.data;
    expect(own).toMatchObject({ city: 'Satara', education: 'B.Tech' }); // the owner sees everything
  });

  it('never leaks hidden fields through recommendations, reasons, search filters or the score breakdown', async () => {
    const [owner, viewer] = [await member(), await member()];
    await giveHobby(owner, 'Kayaking');
    await giveHobby(viewer, 'Kayaking');
    const before = await matchFor(viewer, owner);
    expect(before.profile.location).toBe('Satara, Maharashtra, India');
    expect(before.whyThisMatch.some((r) => /live in/.test(r))).toBe(true);
    expect(before.commonHobbies).toContain('Kayaking');
    expect((await matchFor(viewer, owner, '&location=Satara'))).toBeDefined();

    await privacy(owner, { locationVisibility: 'nobody', hobbiesVisibility: 'nobody', occupationVisibility: 'nobody', photoVisibility: 'nobody' });
    const after = await matchFor(viewer, owner);
    expect(after.profile).toMatchObject({ location: null, occupation: null, profilePicture: null, name: owner.name });
    expect(after.commonHobbies).toEqual([]);
    expect(after.whyThisMatch.join(' ')).not.toMatch(/live in|Satara|Kayaking|hobb|Architect/i);
    expect(after.scoreBreakdown.location).toBeUndefined();
    expect(after.scoreBreakdown.details?.hobbyJaccard).toBeUndefined();
    expect(after.mlFeatures.location_similarity).toBeUndefined();
    expect(JSON.stringify(after)).not.toMatch(/Satara|Kayaking|Architect/);
    // Searching by a hidden value does not find the profile.
    expect(await matchFor(viewer, owner, '&location=Satara')).toBeUndefined();
    expect(await matchFor(viewer, owner, '&occupation=Architect')).toBeUndefined();

    const details = (await viewer.api.get(`/matches/${owner.userId}`)).body.data;
    expect(JSON.stringify(details)).not.toMatch(/Satara|Kayaking|Architect/);
  });

  it('hides "connections only" profiles from non-connections', async () => {
    const [owner, viewer] = [await member(), await member()];
    await privacy(owner, { profileVisibility: 'connections' });

    expect(await matchFor(viewer, owner)).toBeUndefined();
    expect((await viewer.api.get(`/matches/${owner.userId}`)).status).toBe(403);
    const restricted = (await viewer.api.get(`/profile/${owner.userId}`)).body.data;
    expect(restricted).toMatchObject({ name: owner.name, restricted: true, location: null, education: null, bio: null, age: null, gender: null });

    await connect(viewer, owner);
    expect((await viewer.api.get(`/profile/${owner.userId}`)).body.data).toMatchObject({ restricted: false, education: 'B.Tech' });
  });

  it('applies the settings to connection lists, chat headers and call cards', async () => {
    const [owner, viewer] = [await member(), await member()];
    await privacy(owner, { locationVisibility: 'nobody', ageVisibility: 'nobody' });
    await connect(viewer, owner);

    const card = (await viewer.api.get('/connections')).body.data.connections[0].user;
    expect(card).toEqual({ userId: owner.userId, name: owner.name, profilePicture: null, age: null, location: null });
    expect((await viewer.api.get(`/messages/${owner.userId}`)).body.data.participant).toMatchObject({ age: null, location: null });

    const placed = await viewer.api.post('/calls', { receiverId: owner.userId });
    expect(placed.body.data.call.otherUser).toMatchObject({ age: null, location: null });
    await viewer.api.post(`/calls/${placed.body.data.call.id}/end`);
  });

  it('shares online status only as the user allows', async () => {
    const [owner, viewer] = [await member(), await member()];
    await connect(viewer, owner);
    const ownerSocket = await openSocket(owner.token);
    const viewerSocket = await openSocket(viewer.token);

    // Default "connections": the connection sees it.
    expect((await emit(viewerSocket, 'conversation:join', { userId: owner.userId })).participantOnline).toBe(true);

    await privacy(owner, { onlineStatusVisibility: 'nobody' });
    expect((await emit(viewerSocket, 'conversation:join', { userId: owner.userId })).participantOnline).toBeNull();
    const quiet = silence(viewerSocket, 'presence:update');
    await emit(ownerSocket, 'conversation:join', { userId: viewer.userId });
    await quiet;
    expect((await emit(viewerSocket, 'call:initiate', { userId: owner.userId })).receiverOnline).toBeNull();
  });
});

/* ---------------- blocking ---------------- */

describe('blocking', () => {
  it('blocks (blockedUserId or userId), refuses yourself and unknown users, and is idempotent', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    expect((await a.api.post('/blocks', { blockedUserId: b.userId })).status).toBe(201);
    expect((await a.api.post('/blocks', { blockedUserId: b.userId })).status).toBe(200);
    expect((await a.api.post('/blocks', { userId: c.userId })).status).toBe(201);
    expect((await a.api.post('/blocks', { blockedUserId: a.userId })).status).toBe(400);
    expect((await a.api.post('/blocks', { blockedUserId: 999999999 })).status).toBe(404);
    expect((await a.api.post('/blocks', {})).status).toBe(422);
    expect(await db('blocks').where({ blocker_id: a.userId, blocked_id: b.userId })).toHaveLength(1);

    const list = (await a.api.get('/blocks')).body.data.blocks;
    expect(list.map((x) => x.userId).sort()).toEqual([b.userId, c.userId].sort());
    expect(JSON.stringify(list)).not.toMatch(/email|mobile|date_of_birth/i);
  });

  it('lets only the blocker unblock', async () => {
    const [a, b] = [await member(), await member()];
    await a.api.post('/blocks', { blockedUserId: b.userId });
    expect((await b.api.delete(`/blocks/${a.userId}`)).status).toBe(404); // b never blocked a
    expect(await db('blocks').where({ blocker_id: a.userId, blocked_id: b.userId })).toHaveLength(1);
    expect((await a.api.delete(`/blocks/${b.userId}`)).status).toBe(200);
  });

  it('is enforced in both directions for requests, messages, calls, profiles and recommendations', async () => {
    const [a, b] = [await member(), await member()];
    await a.api.post('/blocks', { blockedUserId: b.userId });

    for (const [from, to] of [[a, b], [b, a]]) {
      expect((await from.api.post('/connections', { receiverId: to.userId })).status).toBe(403);
      expect((await from.api.post('/messages', { receiverId: to.userId, message: 'hi' })).status).toBe(403);
      expect((await from.api.post('/calls', { receiverId: to.userId })).status).toBe(403);
      expect((await from.api.get(`/profile/${to.userId}`)).status).toBe(404);
      expect((await from.api.get(`/matches/${to.userId}`)).status).toBe(403);
      expect(await matchFor(from, to)).toBeUndefined();
      const socket = await openSocket(from.token);
      expect(await emit(socket, 'call:initiate', { userId: to.userId })).toMatchObject({ success: false, code: 403 });
      expect(await emit(socket, 'message:send', { receiverId: to.userId, message: 'hi' })).toMatchObject({ success: false, code: 403 });
    }
  });

  it('ends the relationship: accepted → disconnected, pending → cancelled; unblocking restores nothing', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const accepted = await connect(a, b);
    const pending = (await c.api.post('/connections', { receiverId: a.userId })).body.data.connection.id;

    await a.api.post('/blocks', { blockedUserId: b.userId });
    await a.api.post('/blocks', { blockedUserId: c.userId });
    expect((await db('connection_requests').where({ request_id: accepted }).first()).status).toBe('disconnected');
    expect((await db('connection_requests').where({ request_id: pending }).first()).status).toBe('cancelled');
    expect((await a.api.get('/connections/requests/received')).body.data.requests).toEqual([]);

    await a.api.delete(`/blocks/${b.userId}`);
    await a.api.delete(`/blocks/${c.userId}`);
    expect((await db('connection_requests').where({ request_id: accepted }).first()).status).toBe('disconnected');
    expect((await a.api.get('/connections')).body.data.connections).toEqual([]);
    expect((await a.api.post('/messages', { receiverId: b.userId, message: 'hi' })).status).toBe(403);
    // Normal rules apply again: they may connect anew.
    expect((await b.api.post('/connections', { receiverId: a.userId })).status).toBe(201);
  });

  it('ends an active call and closes open chats immediately, so stale socket state cannot be used', async () => {
    const [a, b] = [await member(), await member()];
    await connect(a, b);
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    await emit(aSocket, 'conversation:join', { userId: b.userId });
    const incoming = next(bSocket, 'call:incoming');
    await emit(aSocket, 'call:initiate', { userId: b.userId });
    const callId = (await incoming).call.id;
    await emit(bSocket, 'call:accept', { callId });
    // Warm the call permission cache.
    await emit(aSocket, 'call:offer', { callId, description: { type: 'offer', sdp: 'v=0' } });

    const callEnded = next(aSocket, 'call:ended');
    const chatClosed = next(aSocket, 'conversation:closed');
    await b.api.post('/blocks', { blockedUserId: a.userId });
    expect((await callEnded).call).toMatchObject({ id: callId, status: 'ended', endReason: 'unavailable' });
    expect((await chatClosed).canSend).toBe(false);

    expect(await emit(aSocket, 'call:offer', { callId, description: { type: 'offer', sdp: 'v=0' } })).toMatchObject({ success: false, code: 409 });
    expect(await emit(aSocket, 'typing:start', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
    expect(await emit(aSocket, 'conversation:join', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
  });

  it('keeps message history (not deleted) and hides it while blocked', async () => {
    const [a, b] = [await member(), await member()];
    await connect(a, b);
    await a.api.post('/messages', { receiverId: b.userId, message: 'before' });
    await a.api.post('/blocks', { blockedUserId: b.userId });
    expect((await b.api.get(`/messages/${a.userId}`)).status).toBe(403);
    expect(await db('messages').where({ sender_id: a.userId })).toHaveLength(1);
    await a.api.delete(`/blocks/${b.userId}`);
    // Disconnected pair with history: read-only, as for any removed connection.
    const history = (await b.api.get(`/messages/${a.userId}`)).body.data;
    expect(history).toMatchObject({ canSend: false, messages: [expect.objectContaining({ message: 'before' })] });
  });

  it('still lets unblocked, connected users chat and call (regression)', async () => {
    const [a, b] = [await member(), await member()];
    await connect(a, b);
    expect((await a.api.post('/messages', { receiverId: b.userId, message: 'hello' })).status).toBe(201);
    const placed = await a.api.post('/calls', { receiverId: b.userId });
    expect(placed.status).toBe(201);
    await a.api.post(`/calls/${placed.body.data.call.id}/end`);
    expect(await matchFor(a, b)).toBeDefined();
  });
});

/* ---------------- reporting ---------------- */

describe('reporting', () => {
  it('requires authentication', async () => {
    expect((await request(httpServer).post('/api/v1/reports').send({ reportedUserId: 1, reason: 'spam' })).status).toBe(401);
  });

  it('files a valid report and answers without moderation details', async () => {
    const [a, b] = [await member(), await member()];
    const res = await a.api.post('/reports', { reportedUserId: b.userId, reason: 'HARASSMENT', description: '  Sent abusive messages.  ' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/received/);
    expect(res.body.data.report).toEqual({
      id: expect.any(Number),
      reportedUserId: b.userId,
      reason: 'harassment',
      description: 'Sent abusive messages.',
      state: 'open',
      createdAt: expect.any(String),
    });
    const row = await db('reports').where({ report_id: res.body.data.report.id }).first();
    expect(row).toMatchObject({ reporter_id: a.userId, reported_id: b.userId, reason: 'harassment', status: 'pending' });
    // Filing a report changes nothing about the reported account.
    expect((await db('users').where({ user_id: b.userId }).first()).status).toBe('active');
  });

  it('validates reports', async () => {
    const [a, b] = [await member(), await member()];
    expect((await a.api.post('/reports', { reportedUserId: a.userId, reason: 'spam' })).status).toBe(400);
    expect((await a.api.post('/reports', { reportedUserId: 999999999, reason: 'spam' })).status).toBe(404);
    for (const body of [
      { reportedUserId: b.userId, reason: 'rude' },
      { reportedUserId: b.userId },
      { reportedUserId: b.userId, reason: 'spam', description: 'x'.repeat(2001) },
      { reportedUserId: b.userId, reason: 'spam', status: 'resolved' },
      { reportedUserId: b.userId, reason: 'spam', reporterId: b.userId },
      { reportedUserId: 'abc', reason: 'spam' },
    ]) {
      expect((await a.api.post('/reports', body)).status).toBe(422);
    }
    expect(await db('reports').where({ reporter_id: a.userId })).toHaveLength(0);
  });

  it('treats a repeated open report as the same report, but keeps reports by other users', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const first = await a.api.post('/reports', { reportedUserId: b.userId, reason: 'spam' });
    const again = await a.api.post('/reports', { reportedUserId: b.userId, reason: 'spam', description: 'again' });
    expect(again.status).toBe(200);
    expect(again.body.data.report.id).toBe(first.body.data.report.id);
    expect((await a.api.post('/reports', { reportedUserId: b.userId, reason: 'fake_profile' })).status).toBe(201);
    expect((await c.api.post('/reports', { reportedUserId: b.userId, reason: 'spam' })).status).toBe(201);
    expect(await db('reports').where({ reported_id: b.userId })).toHaveLength(3);
  });

  it('rate-limits report submissions', async () => {
    const original = config.reports.rateLimitPerHour;
    config.reports.rateLimitPerHour = 2;
    try {
      const reporter = await member();
      const targets = [await member(), await member(), await member()];
      expect((await reporter.api.post('/reports', { reportedUserId: targets[0].userId, reason: 'spam' })).status).toBe(201);
      expect((await reporter.api.post('/reports', { reportedUserId: targets[1].userId, reason: 'spam' })).status).toBe(201);
      const limited = await reporter.api.post('/reports', { reportedUserId: targets[2].userId, reason: 'spam' });
      expect(limited.status).toBe(429);
    } finally {
      config.reports.rateLimitPerHour = original;
    }
  });

  it('shows reporters only their own reports, and never lets users moderate', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const filed = (await a.api.post('/reports', { reportedUserId: b.userId, reason: 'spam' })).body.data.report;
    await c.api.post('/reports', { reportedUserId: b.userId, reason: 'threatening' });

    const own = (await a.api.get('/reports')).body.data.reports;
    expect(own.map((r) => r.id)).toEqual([filed.id]);
    expect(JSON.stringify(own)).not.toMatch(/reviewed|resolution|action_taken|actionTaken|status/);
    expect((await b.api.get('/reports')).body.data.reports).toEqual([]);

    expect((await a.api.patch(`/admin/reports/${filed.id}`, { status: 'resolved' })).status).toBe(403);
    expect((await a.api.get('/admin/reports')).status).toBe(403);
    await expect(reportService.updateReportStatus(a.userId, filed.id, { status: 'resolved' })).rejects.toMatchObject({ statusCode: 403 });
    expect((await db('reports').where({ report_id: filed.id }).first()).status).toBe('pending');
  });

  it('prepares moderation for admins (Phase 14): valid transitions only', async () => {
    const [a, b] = [await member(), await member()];
    const admin = await member();
    await db('users').where({ user_id: admin.userId }).update({ role: 'admin' });
    const filed = (await a.api.post('/reports', { reportedUserId: b.userId, reason: 'spam' })).body.data.report;

    const review = await reportService.updateReportStatus(admin.userId, filed.id, { status: 'under_review' });
    expect(review).toMatchObject({ status: 'under_review', reviewedBy: admin.userId });
    const done = await reportService.updateReportStatus(admin.userId, filed.id, { status: 'resolved', actionTaken: 'warning', resolutionNote: 'Warned.' });
    expect(done).toMatchObject({ status: 'resolved', actionTaken: 'warning', resolutionNote: 'Warned.' });
    await expect(reportService.updateReportStatus(admin.userId, filed.id, { status: 'dismissed' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(reportService.updateReportStatus(admin.userId, filed.id, { status: 'pending' })).rejects.toMatchObject({ statusCode: 400 });
    expect((await reportService.listReportsForReview(admin.userId, { status: 'resolved', limit: 100, sort: 'newest' })).reports.map((r) => r.id)).toContain(filed.id);

    // The reporter sees only that it is closed.
    expect((await a.api.get('/reports')).body.data.reports[0].state).toBe('closed');
  });

  it('lists the report reasons', async () => {
    const a = await member();
    const reasons = (await a.api.get('/reports/reasons')).body.data.reasons.map((r) => r.value);
    expect(reasons).toEqual(['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'threatening', 'other']);
  });
});
