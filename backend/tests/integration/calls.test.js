/**
 * Phase 12 video calls — real HTTP + real Socket.IO clients against a real
 * database. The WebRTC media path itself runs in browsers (see the manual /
 * two-browser test in docs/phase-12-video-calls.md); here the signalling,
 * state machine, authorization and history are tested end to end.
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;

const crypto = require('crypto');
const http = require('http');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const { attachSocketServer, closeSocketServer } = require('../../src/sockets');
const callService = require('../../src/services/callService');
const logger = require('../../src/utils/logger');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');

// Several tests drive full call lifecycles over real sockets; allow for a busy machine.
jest.setTimeout(20000);

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';
const ONE_FACE = { face_detected: true, face_count: 1 };
const ORIGINAL_CALLS = { ...config.calls };
const ORIGINAL_WEBRTC = { ...config.webrtc };

let db;
let httpServer;
let io;
let baseUrl;
let seq = 0;
const openSockets = [];

/* ---------------- helpers ---------------- */

const letterName = (n) => `Caller ${String.fromCharCode(65 + (Math.floor(n / 26) % 26))}${String.fromCharCode(97 + (n % 26))}`;

const as = (token) => ({
  get: (p) => request(httpServer).get(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body) => request(httpServer).post(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (p, body) => request(httpServer).put(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  delete: (p) => request(httpServer).delete(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
});

async function member() {
  const email = `call${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(httpServer).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  await request(httpServer).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const login = await request(httpServer).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
  const done = await request(httpServer)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
  const token = done.body.data.access_token;
  const api = as(token);
  expect((await api.post('/profile', { name: letterName(seq), dateOfBirth: '1994-04-04', gender: 'male', city: 'Pune' })).status).toBe(201);
  return { userId: reg.body.data.user_id, email, token, api };
}

async function connect(a, b, { accept = true } = {}) {
  const sent = await a.api.post('/connections', { receiverId: b.userId });
  const id = sent.body.data.connection.id;
  if (accept) await b.api.put(`/connections/${id}`, { action: 'accept' });
  return id;
}

async function connectedPair() {
  const [a, b] = [await member(), await member()];
  const connectionId = await connect(a, b);
  return { a, b, connectionId };
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

function next(socket, event, { timeout = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeout);
    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
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

const callRow = (id) => db('video_calls').where({ call_id: id }).first();
const block = (blocker, blocked) => blocker.api.post('/blocks', { userId: blocked.userId });
const OFFER = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n' };
const ANSWER = { type: 'answer', sdp: 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\n' };
const CANDIDATE = { candidate: 'candidate:1 1 udp 2122260223 192.168.1.2 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 };

/** A (socket aSocket) calls B; B's socket bSocket accepts. */
async function acceptedCall() {
  const pair = await connectedPair();
  const [aSocket, bSocket] = [await openSocket(pair.a.token), await openSocket(pair.b.token)];
  const incoming = next(bSocket, 'call:incoming');
  const started = await emit(aSocket, 'call:initiate', { userId: pair.b.userId });
  expect(started).toMatchObject({ success: true, busy: false, call: { status: 'ringing' } });
  const callId = (await incoming).call.id;
  expect((await emit(bSocket, 'call:accept', { callId })).success).toBe(true);
  return { ...pair, aSocket, bSocket, callId };
}

/* ---------------- setup ---------------- */

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
  httpServer = http.createServer(app);
  io = attachSocketServer(httpServer, { corsOrigins: [] });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
}, 60000);

afterEach(() => {
  Object.assign(config.calls, ORIGINAL_CALLS);
  Object.assign(config.webrtc, ORIGINAL_WEBRTC);
  callService.resetForTests();
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await closeSocketServer(io);
  await closeConnection();
});

/* ---------------- authentication & ICE servers ---------------- */

describe('authentication and ICE servers', () => {
  it.each([
    ['get', '/api/v1/calls/ice-servers'],
    ['get', '/api/v1/calls/history'],
    ['post', '/api/v1/calls'],
    ['get', '/api/v1/calls/1'],
    ['post', '/api/v1/calls/1/accept'],
    ['post', '/api/v1/calls/1/reject'],
    ['post', '/api/v1/calls/1/end'],
  ])('%s %s requires a valid access token', async (method, url) => {
    const res = await request(httpServer)[method](url).send({ receiverId: 1 });
    expect(res.status).toBe(401);
  });

  it('returns STUN servers by default and no TURN credentials', async () => {
    const a = await member();
    const res = await a.api.get('/calls/ice-servers');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toEqual({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], expiresAt: null, relay: false });
  });

  it('mints short-lived TURN credentials from the shared secret without exposing or logging it', async () => {
    const a = await member();
    Object.assign(config.webrtc, { turnUrls: ['turn:turn.example.com:3478?transport=udp'], turnSecret: 'super-secret-turn-key', turnCredentialTtlSeconds: 600 });
    const logged = [];
    const spies = ['info', 'warn', 'error'].map((level) => jest.spyOn(logger, level).mockImplementation((...args) => logged.push(JSON.stringify(args))));
    try {
      const res = await a.api.get('/calls/ice-servers');
      const turn = res.body.data.iceServers.find((s) => s.urls[0].startsWith('turn:'));
      const [expiry, userId] = turn.username.split(':').map(Number);
      expect(userId).toBe(a.userId);
      expect(expiry * 1000 - Date.now()).toBeGreaterThan(590 * 1000);
      expect(turn.credential).toBe(crypto.createHmac('sha1', 'super-secret-turn-key').update(turn.username).digest('base64'));
      expect(JSON.stringify(res.body)).not.toContain('super-secret-turn-key');
      expect(logged.join('\n')).not.toMatch(/super-secret-turn-key|credential/);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

/* ---------------- who may call ---------------- */

describe('who may call', () => {
  it.each([
    ['pending', async (a, b) => connect(a, b, { accept: false })],
    ['rejected', async (a, b) => {
      const id = await connect(a, b, { accept: false });
      await b.api.put(`/connections/${id}`, { action: 'reject' });
    }],
    ['not connected', async () => {}],
    ['disconnected', async (a, b) => {
      const id = await connect(a, b);
      await a.api.delete(`/connections/${id}`);
    }],
  ])('refuses calls between %s users (REST and socket)', async (_, setup) => {
    const [a, b] = [await member(), await member()];
    await setup(a, b);
    const rest = await a.api.post('/calls', { receiverId: b.userId });
    expect(rest.status).toBe(403);
    expect(rest.body.message).toBe('Video calls are available only between connected users.');
    const socket = await openSocket(a.token);
    expect(await emit(socket, 'call:initiate', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
    expect(await db('video_calls').where({ caller_id: a.userId })).toHaveLength(0);
  });

  it('refuses blocked users in both directions', async () => {
    const { a, b } = await connectedPair();
    await block(b, a);
    for (const [from, to] of [[a, b], [b, a]]) {
      const res = await from.api.post('/calls', { receiverId: to.userId });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You cannot call this user.');
    }
  });

  it('refuses yourself, unknown users and malformed ids', async () => {
    const a = await member();
    expect((await a.api.post('/calls', { receiverId: a.userId })).status).toBe(400);
    expect((await a.api.post('/calls', { receiverId: 999999999 })).status).toBe(404);
    expect((await a.api.post('/calls', { receiverId: 'abc' })).status).toBe(422);
    expect((await a.api.get('/calls/abc')).status).toBe(422);
    expect((await a.api.get('/calls/999999999')).status).toBe(404);
  });
});

/* ---------------- ringing, accept, reject ---------------- */

describe('ringing, accepting and rejecting', () => {
  it('rings every device of the receiver with only public caller details', async () => {
    const { a, b } = await connectedPair();
    const [aSocket, b1, b2] = [await openSocket(a.token), await openSocket(b.token), await openSocket(b.token)];
    const rings = [next(b1, 'call:incoming'), next(b2, 'call:incoming')];
    const ack = await emit(aSocket, 'call:initiate', { userId: b.userId });

    expect(ack).toMatchObject({ success: true, busy: false, receiverOnline: true, call: { status: 'ringing', direction: 'outgoing', otherUser: { userId: b.userId } } });
    for (const ring of await Promise.all(rings)) {
      expect(ring).toEqual({
        call: expect.objectContaining({ id: ack.call.id, callerId: a.userId, receiverId: b.userId, status: 'ringing' }),
        caller: { userId: a.userId, name: expect.any(String), profilePicture: null, age: expect.any(Number), location: 'Pune' },
      });
      expect(JSON.stringify(ring)).not.toContain(a.email);
    }
  });

  it('lets only the receiver accept, once; the other devices stop ringing', async () => {
    const { a, b } = await connectedPair();
    const stranger = await member();
    const [aSocket, b1, b2] = [await openSocket(a.token), await openSocket(b.token), await openSocket(b.token)];
    const callId = (await emit(aSocket, 'call:initiate', { userId: b.userId })).call.id;

    expect(await emit(aSocket, 'call:accept', { callId })).toMatchObject({ success: false, code: 403 }); // own call
    expect((await stranger.api.post(`/calls/${callId}/accept`)).status).toBe(404);

    const accepted = [next(aSocket, 'call:accepted'), next(b2, 'call:accepted')];
    expect(await emit(b1, 'call:accept', { callId })).toMatchObject({ success: true, call: { status: 'accepted' } });
    for (const event of await Promise.all(accepted)) expect(event.call).toMatchObject({ id: callId, status: 'accepted' });

    expect(await emit(b2, 'call:accept', { callId })).toMatchObject({ success: false, code: 409 });
    expect((await callRow(callId)).answered_at).not.toBeNull();
  });

  it('rejects a call without ever activating it', async () => {
    const { a, b } = await connectedPair();
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    const callId = (await emit(aSocket, 'call:initiate', { userId: b.userId })).call.id;

    expect(await emit(aSocket, 'call:reject', { callId })).toMatchObject({ success: false, code: 403 });
    const ended = next(aSocket, 'call:ended');
    expect(await emit(bSocket, 'call:reject', { callId })).toMatchObject({ success: true, call: { status: 'rejected' } });
    expect((await ended).call).toMatchObject({ id: callId, status: 'rejected', endReason: 'rejected' });

    expect(await emit(bSocket, 'call:accept', { callId })).toMatchObject({ success: false, code: 409 });
    expect(await emit(aSocket, 'call:offer', { callId, description: OFFER })).toMatchObject({ success: false, code: 409 });
    expect((await callRow(callId)).status).toBe('rejected');
  });

  it('lets the caller cancel a ringing call', async () => {
    const { a, b } = await connectedPair();
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    const callId = (await emit(aSocket, 'call:initiate', { userId: b.userId })).call.id;
    const ended = next(bSocket, 'call:ended');
    expect(await emit(aSocket, 'call:end', { callId })).toMatchObject({ success: true, call: { status: 'cancelled' } });
    expect((await ended).call.status).toBe('cancelled');
  });

  it('marks unanswered calls missed exactly once', async () => {
    config.calls.ringTimeoutSeconds = 1;
    const { a, b } = await connectedPair();
    const aSocket = await openSocket(a.token);
    const callId = (await emit(aSocket, 'call:initiate', { userId: b.userId })).call.id;
    const ended = await next(aSocket, 'call:ended', { timeout: 4000 });
    expect(ended.call).toMatchObject({ id: callId, status: 'missed', endReason: 'no_answer' });

    // Repeated timeouts / sweeps change nothing.
    expect(await callService.missCall(callId)).toBeNull();
    await io.callSweep.tick();
    expect((await callRow(callId)).status).toBe('missed');
    expect(await db('video_calls').where({ caller_id: a.userId })).toHaveLength(1);
  });

  it('answers busy when the receiver is already in a call, and refuses a second call by the caller', async () => {
    const { a, b, aSocket } = await acceptedCall();
    const c = await member();
    await connect(c, b);
    const cSocket = await openSocket(c.token);

    const busyEvent = next(cSocket, 'call:busy');
    const ack = await emit(cSocket, 'call:initiate', { userId: b.userId });
    expect(ack).toMatchObject({ success: true, busy: true, call: { status: 'busy' } });
    expect((await busyEvent).call.status).toBe('busy');

    await connect(a, c);
    expect(await emit(aSocket, 'call:initiate', { userId: c.userId })).toMatchObject({ success: false, code: 409, error: 'You are already in a call.' });
  });

  it('lets only one of two simultaneous calls between the same users ring', async () => {
    const { a, b } = await connectedPair();
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    const [x, y] = await Promise.all([emit(aSocket, 'call:initiate', { userId: b.userId }), emit(bSocket, 'call:initiate', { userId: a.userId })]);
    const ringing = [x, y].filter((r) => r.success && r.busy === false);
    expect(ringing).toHaveLength(1);
    expect(await db('video_calls').whereIn('caller_id', [a.userId, b.userId]).where({ status: 'ringing' })).toHaveLength(1);
  });
});

/* ---------------- signalling ---------------- */

describe('signalling', () => {
  it('relays offer, answer and ICE only between the two bound devices', async () => {
    const { a, b, aSocket, bSocket, callId } = await acceptedCall();
    const bOther = await openSocket(b.token); // B's second tab: not part of the call
    const stranger = await member();
    const strangerSocket = await openSocket(stranger.token);
    const quiet = [silence(bOther, 'call:offer'), silence(strangerSocket, 'call:offer'), silence(strangerSocket, 'call:ice-candidate')];

    const offer = next(bSocket, 'call:offer');
    expect(await emit(aSocket, 'call:offer', { callId, description: OFFER, targetSocketId: strangerSocket.id })).toEqual({ success: true });
    expect(await offer).toEqual({ callId, fromUserId: a.userId, description: OFFER });

    const answer = next(aSocket, 'call:answer');
    expect(await emit(bSocket, 'call:answer', { callId, description: ANSWER })).toEqual({ success: true });
    expect(await answer).toEqual({ callId, fromUserId: b.userId, description: ANSWER });

    const ice = next(bSocket, 'call:ice-candidate');
    expect(await emit(aSocket, 'call:ice-candidate', { callId, candidate: CANDIDATE })).toEqual({ success: true });
    expect(await ice).toEqual({ callId, fromUserId: a.userId, candidate: CANDIDATE });
    await Promise.all(quiet);
  });

  it('refuses signalling from outsiders, unbound devices and the wrong role', async () => {
    const { b, aSocket, bSocket, callId } = await acceptedCall();
    const stranger = await member();
    const strangerSocket = await openSocket(stranger.token);
    const bOther = await openSocket(b.token);

    expect(await emit(strangerSocket, 'call:offer', { callId, description: OFFER })).toMatchObject({ success: false, code: 404 });
    expect(await emit(strangerSocket, 'call:join', { callId })).toMatchObject({ success: false, code: 404 });
    expect(await emit(bOther, 'call:ice-candidate', { callId, candidate: CANDIDATE })).toMatchObject({ success: false, code: 403 });
    expect(await emit(bSocket, 'call:offer', { callId, description: OFFER })).toMatchObject({ success: false, code: 403 }); // receiver offers
    expect(await emit(aSocket, 'call:answer', { callId, description: ANSWER })).toMatchObject({ success: false, code: 403 }); // caller answers
  });

  it('validates signalling payloads', async () => {
    const { aSocket, callId } = await acceptedCall();
    const huge = { type: 'offer', sdp: 'x'.repeat(49 * 1024) };
    for (const payload of [
      { callId, description: huge },
      { callId, description: { type: 'answer', sdp: 'v=0' } },
      { callId: 'abc', description: OFFER },
      { description: OFFER },
      'not-an-object',
    ]) {
      expect(await emit(aSocket, 'call:offer', payload)).toMatchObject({ success: false, code: 422 });
    }
    expect(await emit(aSocket, 'call:ice-candidate', { callId, candidate: { candidate: 'x'.repeat(3000) } })).toMatchObject({ success: false, code: 422 });
    expect(await emit(aSocket, 'call:offer', { callId: 999999999, description: OFFER })).toMatchObject({ success: false, code: 404 });
  });

  it('counts the call as connected only when a peer reports it, then ends it with a duration', async () => {
    const { a, b, aSocket, bSocket, callId } = await acceptedCall();
    expect((await callRow(callId)).status).toBe('accepted');

    const connected = next(aSocket, 'call:connected');
    expect(await emit(bSocket, 'call:connected', { callId })).toMatchObject({ success: true, call: { status: 'connected' } });
    expect((await connected).call.status).toBe('connected');
    expect(await emit(aSocket, 'call:connected', { callId })).toMatchObject({ success: true }); // idempotent

    const ended = next(bSocket, 'call:ended');
    expect(await emit(aSocket, 'call:end', { callId })).toMatchObject({ success: true, call: { status: 'ended' } });
    expect((await ended).call).toMatchObject({ status: 'ended', endReason: 'hangup', durationSeconds: expect.any(Number) });
    const row = await callRow(callId);
    expect(Number(row.ended_by)).toBe(a.userId);

    // A finished call accepts no more signalling or state changes.
    expect(await emit(aSocket, 'call:ice-candidate', { callId, candidate: CANDIDATE })).toMatchObject({ success: false, code: 409 });
    expect(await emit(bSocket, 'call:end', { callId })).toMatchObject({ success: false, code: 409 });
    expect((await b.api.post(`/calls/${callId}/end`)).status).toBe(409);
  });

  it('lets only participants end a call', async () => {
    const { callId } = await acceptedCall();
    const stranger = await member();
    expect((await stranger.api.post(`/calls/${callId}/end`)).status).toBe(404);
    expect((await callRow(callId)).status).toBe('accepted');
  });

  it('records a failed connection reported by a participant', async () => {
    const { aSocket, bSocket, callId } = await acceptedCall();
    const ended = next(bSocket, 'call:ended');
    expect(await emit(aSocket, 'call:failed', { callId })).toMatchObject({ success: true, call: { status: 'failed', endReason: 'connection_failed' } });
    expect((await ended).call.status).toBe('failed');
  });
});

/* ---------------- interruptions ---------------- */

describe('blocks, removed connections and disconnects', () => {
  it('ends an active call immediately when one user blocks the other', async () => {
    const { a, b, aSocket, callId } = await acceptedCall();
    const ended = next(aSocket, 'call:ended');
    await block(b, a);
    expect((await ended).call).toMatchObject({ id: callId, status: 'ended', endReason: 'unavailable' });
  });

  it('ends an active call when the connection is removed', async () => {
    const { a, aSocket, callId, connectionId } = await acceptedCall();
    const ended = next(aSocket, 'call:ended');
    await a.api.delete(`/connections/${connectionId}`);
    expect((await ended).call).toMatchObject({ id: callId, endReason: 'disconnected' });
  });

  it('keeps the call when a participant re-joins within the grace period', async () => {
    config.calls.rejoinGraceSeconds = 1;
    const { b, aSocket, bSocket, callId } = await acceptedCall();
    const left = next(aSocket, 'call:peer-left');
    bSocket.disconnect();
    expect(await left).toEqual({ callId, userId: b.userId });

    const rejoined = next(aSocket, 'call:peer-rejoined');
    const bAgain = await openSocket(b.token);
    expect(await emit(bAgain, 'call:join', { callId })).toMatchObject({ success: true, call: { status: 'accepted' } });
    expect(await rejoined).toEqual({ callId, userId: b.userId });

    await new Promise((r) => setTimeout(r, 1500));
    expect((await callRow(callId)).status).toBe('accepted');
  });

  it('ends the call when a participant does not come back', async () => {
    config.calls.rejoinGraceSeconds = 1;
    const { aSocket, bSocket, callId } = await acceptedCall();
    const ended = next(aSocket, 'call:ended', { timeout: 4000 });
    bSocket.disconnect();
    expect((await ended).call).toMatchObject({ id: callId, status: 'failed', endReason: 'participant_left' });
  });

  it('cleans up calls whose timers were lost (e.g. after a restart)', async () => {
    const { a, b } = await connectedPair();
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const [ringingId] = await db('video_calls').insert({ caller_id: a.userId, receiver_id: b.userId, status: 'ringing', created_at: old, updated_at: old });
    await io.callSweep.tick();
    expect((await callRow(ringingId)).status).toBe('missed');
  });
});

/* ---------------- history ---------------- */

describe('call history', () => {
  it('shows only the user’s own calls, newest first, without signalling data', async () => {
    const { a, b, aSocket, callId } = await acceptedCall();
    await emit(aSocket, 'call:end', { callId });
    const stranger = await member();

    const history = (await a.api.get('/calls/history')).body.data;
    expect(history.calls[0]).toMatchObject({ id: callId, direction: 'outgoing', status: 'ended', otherUser: { userId: b.userId } });
    expect(JSON.stringify(history)).not.toMatch(/sdp|candidate|credential|email/i);
    expect((await b.api.get('/calls/history')).body.data.calls[0]).toMatchObject({ id: callId, direction: 'incoming' });
    expect((await stranger.api.get('/calls/history')).body.data.calls).toEqual([]);
    expect((await stranger.api.get(`/calls/${callId}`)).status).toBe(404);
    expect((await a.api.get('/calls/history?limit=500')).status).toBe(422);
  });

  it('supports the REST call controls', async () => {
    const { a, b } = await connectedPair();
    const placed = await a.api.post('/calls', { receiverId: b.userId });
    expect(placed.status).toBe(201);
    const id = placed.body.data.call.id;
    expect((await a.api.post(`/calls/${id}/accept`)).status).toBe(403);
    expect((await b.api.post(`/calls/${id}/reject`)).body.data.call.status).toBe('rejected');
    expect((await b.api.get(`/calls/${id}`)).body.data.call).toMatchObject({ status: 'rejected', direction: 'incoming' });
  });
});
