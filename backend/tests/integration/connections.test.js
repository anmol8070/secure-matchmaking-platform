/**
 * Phase 10 connection integration tests — real HTTP requests against a real
 * database (the *_test database; every table is rebuilt by migrations).
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;

const request = require('supertest');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');
const connectionService = require('../../src/services/connectionService');
const { connectionEvents, CONNECTION_EVENTS } = require('../../src/services/connectionEvents');

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';
const ONE_FACE = { face_detected: true, face_count: 1 };

let db;
let seq = 0;

/* ---------------- helpers ---------------- */

const as = (token) => ({
  get: (p) => request(app).get(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body) => request(app).post(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (p, body) => request(app).put(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  delete: (p) => request(app).delete(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
});

/** 'Member Ab', 'Member Ac', ... — profile names may not contain digits. */
const letterName = (n) => `Member ${String.fromCharCode(65 + Math.floor(n / 26) % 26)}${String.fromCharCode(97 + (n % 26))}`;

/** Registers, verifies, logs in and creates a profile. */
async function member(name = letterName(seq + 1)) {
  const email = `conn${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  await request(app).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const login = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
  const done = await request(app)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
  const token = done.body.data.access_token;
  const userId = reg.body.data.user_id;
  const profile = await as(token).post('/profile', {
    name,
    dateOfBirth: '1996-08-15',
    gender: 'female',
    city: 'Kolhapur',
    state: 'Maharashtra',
    country: 'India',
  });
  expect(profile.status).toBe(201);
  return { userId, email, token, api: as(token) };
}

const send = (from, to) => from.api.post('/connections', { receiverId: to.userId });
const act = (user, id, action) => user.api.put(`/connections/${id}`, { action });
const statusOf = async (viewer, other) => (await viewer.api.get(`/connections/status/${other.userId}`)).body.data;
const activity = (connectionRequestId) =>
  db('activity_feedback').where({ connection_request_id: connectionRequestId }).orderBy('id').select('user_id', 'target_user_id', 'action');

/** Sends a request and returns its id. */
async function pending(from, to) {
  const res = await send(from, to);
  expect(res.status).toBe(201);
  return res.body.data.connection.id;
}

async function connected(a, b) {
  const id = await pending(a, b);
  expect((await act(b, id, 'accept')).status).toBe(200);
  return id;
}

const block = (blocker, blocked) => db('blocks').insert({ blocker_id: blocker.userId, blocked_id: blocked.userId });

/* ---------------- setup ---------------- */

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
}, 60000);

afterAll(async () => {
  await closeConnection();
});

/* ---------------- authentication & validation ---------------- */

describe('authentication and validation', () => {
  it.each([
    ['get', '/api/v1/connections'],
    ['post', '/api/v1/connections'],
    ['get', '/api/v1/connections/requests/received'],
    ['get', '/api/v1/connections/requests/sent'],
    ['get', '/api/v1/connections/status/1'],
    ['get', '/api/v1/connections/1'],
    ['put', '/api/v1/connections/1'],
    ['delete', '/api/v1/connections/1'],
  ])('%s %s requires a valid access token', async (method, url) => {
    const res = await request(app)[method](url).send({ receiverId: 1, action: 'accept' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Authentication required' });
  });

  it('rejects missing and malformed ids and unsupported actions with 422', async () => {
    const a = await member();
    for (const body of [{}, { receiverId: 'abc' }, { receiverId: -4 }, { receiverId: 1.5 }]) {
      const res = await a.api.post('/connections', body);
      expect(res.status).toBe(422);
      expect(res.body.errors[0].field).toBe('body.receiverId');
    }
    expect((await a.api.get('/connections/abc')).status).toBe(422);
    expect((await a.api.delete('/connections/0')).status).toBe(422);
    expect((await a.api.put('/connections/5', { action: 'approve' })).status).toBe(422);
    expect((await a.api.put('/connections/5', {})).status).toBe(422);
  });

  it('returns 404 for an id that does not exist', async () => {
    const a = await member();
    for (const res of [
      await a.api.get('/connections/999999999'),
      await act(a, 999999999, 'accept'),
      await a.api.delete('/connections/999999999'),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    }
  });
});

/* ---------------- sending ---------------- */

describe('sending requests', () => {
  it('creates a pending request from the authenticated user (senderId in the body is ignored)', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const res = await a.api.post('/connections', { receiverId: b.userId, senderId: c.userId });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Connection request sent successfully.',
      data: { connection: { status: 'pending', direction: 'outgoing', senderId: a.userId, receiverId: b.userId } },
    });
    const row = await db('connection_requests').where({ request_id: res.body.data.connection.id }).first();
    expect([Number(row.sender_id), Number(row.receiver_id), row.status]).toEqual([a.userId, b.userId, 'pending']);
    expect(await statusOf(a, b)).toMatchObject({ state: 'pending_outgoing', connectionId: row.request_id });
    expect(await statusOf(b, a)).toMatchObject({ state: 'pending_incoming' });
  });

  it('refuses a request to yourself', async () => {
    const a = await member();
    const res = await send(a, a);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'You cannot send a connection request to yourself.' });
  });

  it('refuses unknown and inactive receivers with 404', async () => {
    const [a, b] = [await member(), await member()];
    expect((await a.api.post('/connections', { receiverId: 999999999 })).status).toBe(404);

    await db('users').where({ user_id: b.userId }).update({ status: 'suspended' });
    const res = await send(a, b);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('User not found.');
  });

  it('refuses requests in both directions when either user has blocked the other', async () => {
    const [a, b] = [await member(), await member()];
    await block(a, b);

    for (const [from, to] of [[a, b], [b, a]]) {
      const res = await send(from, to);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You cannot connect with this user.');
    }
    expect(await statusOf(b, a)).toEqual({
      userId: a.userId,
      state: 'unavailable',
      connectionId: null,
      canSendRequest: false,
      canCommunicate: false,
    });
    expect(await db('connection_requests').where({ sender_id: b.userId })).toHaveLength(0);
  });

  it('refuses a duplicate pending request', async () => {
    const [a, b] = [await member(), await member()];
    await pending(a, b);
    const res = await send(a, b);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, message: 'Connection request already pending.' });
  });

  it('handles a reverse request by pointing to the existing incoming request', async () => {
    const [a, b] = [await member(), await member()];
    await pending(a, b);
    const res = await send(b, a);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already sent you a connection request/);
    expect(await db('connection_requests').whereIn('sender_id', [a.userId, b.userId])).toHaveLength(1);
  });

  it('refuses a request between users who are already connected', async () => {
    const [a, b] = [await member(), await member()];
    await connected(a, b);
    for (const [from, to] of [[a, b], [b, a]]) {
      const res = await send(from, to);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Users are already connected.');
    }
  });

  it('lets concurrent duplicate requests create only one row', async () => {
    const [a, b] = [await member(), await member()];
    const results = await Promise.all([send(a, b), send(a, b), send(b, a), send(a, b), send(b, a)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    const rows = await db('connection_requests').whereIn('sender_id', [a.userId, b.userId]);
    expect(rows).toHaveLength(1);
    const requestEvents = await db('activity_feedback').where({ connection_request_id: rows[0].request_id });
    expect(requestEvents).toHaveLength(1);
  });

  it('allows a new request after a cancel, reusing the same row', async () => {
    const [a, b] = [await member(), await member()];
    const id = await pending(a, b);
    expect((await act(a, id, 'cancel')).status).toBe(200);
    expect(await statusOf(b, a)).toMatchObject({ state: 'none', canSendRequest: true });

    const again = await send(b, a);
    expect(again.status).toBe(201);
    expect(again.body.data.connection).toMatchObject({ id, senderId: b.userId, receiverId: a.userId, status: 'pending' });
  });

  it('makes a declined sender wait, but lets the user who declined send a request', async () => {
    const [a, b] = [await member(), await member()];
    const id = await pending(a, b);
    await act(b, id, 'reject');

    const retry = await send(a, b);
    expect(retry.status).toBe(409);
    expect(retry.body.message).toMatch(/declined/);
    expect(await statusOf(a, b)).toMatchObject({ state: 'rejected', canSendRequest: false });

    expect((await send(b, a)).status).toBe(201);
  });
});

/* ---------------- responding ---------------- */

describe('accepting, rejecting, cancelling', () => {
  it('lets only the receiver accept; the sender gets 403 and outsiders 404', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const id = await pending(a, b);

    expect((await act(a, id, 'accept')).status).toBe(403);
    expect((await act(c, id, 'accept')).status).toBe(404);

    const res = await act(b, id, 'accept');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Connection request accepted.', data: { connection: { id, status: 'accepted' } } });
    expect((await db('connection_requests').where({ request_id: id }).first()).responded_at).not.toBeNull();
    expect(await statusOf(a, b)).toMatchObject({ state: 'connected', canCommunicate: true });

    // accepted → accepted is not a valid transition
    expect((await act(b, id, 'accept')).status).toBe(409);
  });

  it('lets only the receiver reject; a rejected request cannot be accepted', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const id = await pending(a, b);

    expect((await act(a, id, 'reject')).status).toBe(403);
    expect((await act(c, id, 'reject')).status).toBe(404);
    expect((await act(b, id, 'reject')).body.data.connection.status).toBe('rejected');

    const accept = await act(b, id, 'accept');
    expect(accept.status).toBe(409);
    expect(accept.body.message).toBe('This connection request is no longer pending.');
    expect(await connectionService.canUsersCommunicate(a.userId, b.userId)).toBe(false);
  });

  it('lets only the sender cancel a pending request', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const id = await pending(a, b);

    expect((await act(b, id, 'cancel')).status).toBe(403);
    expect((await act(c, id, 'cancel')).status).toBe(404);
    expect((await act(a, id, 'cancel')).body.data.connection.status).toBe('cancelled');
    expect((await act(b, id, 'accept')).status).toBe(409);
  });

  it('refuses to accept once a block exists', async () => {
    const [a, b] = [await member(), await member()];
    const id = await pending(a, b);
    await block(a, b);
    expect((await act(b, id, 'accept')).status).toBe(403);
    // ...but the receiver can still decline it
    expect((await act(b, id, 'reject')).status).toBe(200);
  });
});

/* ---------------- removal ---------------- */

describe('removing connections', () => {
  it('lets a member remove a connection and keeps the row as disconnected', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const id = await connected(a, b);

    expect((await c.api.delete(`/connections/${id}`)).status).toBe(404);

    const res = await b.api.delete(`/connections/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Connection removed.', data: { connection: { id, status: 'disconnected' } } });
    expect((await db('connection_requests').where({ request_id: id }).first()).status).toBe('disconnected');

    expect((await a.api.get('/connections')).body.data.connections).toEqual([]);
    expect(await connectionService.canUsersCommunicate(a.userId, b.userId)).toBe(false);
    expect((await a.api.delete(`/connections/${id}`)).status).toBe(409);
  });

  it('refuses DELETE on a request that was never accepted', async () => {
    const [a, b] = [await member(), await member()];
    const id = await pending(a, b);
    const res = await a.api.delete(`/connections/${id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only an active connection can be removed.');
  });
});

/* ---------------- listing, details & privacy ---------------- */

describe('listing and details', () => {
  it('returns only the authenticated user’s requests and connections', async () => {
    const [me, alice, bob, carol, dave] = [await member('Me'), await member('Alice A'), await member('Bob B'), await member('Carol C'), await member('Dave D')];
    const fromAlice = await pending(alice, me);
    const toBob = await pending(me, bob);
    await connected(me, carol);
    await pending(alice, dave); // unrelated to me

    const received = (await me.api.get('/connections/requests/received')).body.data.requests;
    expect(received).toEqual([
      {
        id: fromAlice,
        sender: { userId: alice.userId, name: 'Alice A', profilePicture: null, age: expect.any(Number), location: 'Kolhapur, Maharashtra, India' },
        status: 'pending',
        createdAt: expect.any(String),
      },
    ]);

    const sent = (await me.api.get('/connections/requests/sent')).body.data.requests;
    expect(sent.map((r) => [r.id, r.receiver.userId, r.status])).toEqual([[toBob, bob.userId, 'pending']]);

    const connections = (await me.api.get('/connections')).body.data.connections;
    expect(connections).toEqual([
      { connectionId: expect.any(Number), user: expect.objectContaining({ userId: carol.userId, name: 'Carol C' }), connectedAt: expect.any(String) },
    ]);

    expect((await dave.api.get('/connections/requests/sent')).body.data.requests).toEqual([]);
  });

  it('never exposes private or security fields', async () => {
    const [a, b] = [await member(), await member()];
    const id = await connected(a, b);
    const bodies = [
      await a.api.get('/connections'),
      await a.api.get(`/connections/${id}`),
      await a.api.get('/connections/requests/sent'),
      await b.api.get('/connections/requests/received'),
      await a.api.get(`/connections/status/${b.userId}`),
    ].map((res) => JSON.stringify(res.body));

    for (const body of bodies) {
      expect(body).not.toContain(b.email);
      expect(body).not.toContain(a.email);
      expect(body).not.toMatch(/password|otp|mobile|session|date_of_birth|dateOfBirth|1996-08-15/i);
    }
  });

  it('shows details to members only and hides blocked pairs', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const id = await pending(a, b);

    const res = await b.api.get(`/connections/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.connection).toMatchObject({ id, status: 'pending', direction: 'incoming', user: { userId: a.userId } });
    expect((await c.api.get(`/connections/${id}`)).status).toBe(404);

    await block(b, a);
    expect((await a.api.get(`/connections/${id}`)).status).toBe(404);
    expect((await b.api.get('/connections/requests/received')).body.data.requests).toEqual([]);
  });

  it('drops blocked and inactive users from the lists', async () => {
    const [me, b, c] = [await member(), await member(), await member()];
    await connected(me, b);
    await connected(c, me);
    expect((await me.api.get('/connections')).body.data.connections).toHaveLength(2);

    await block(b, me);
    await db('users').where({ user_id: c.userId }).update({ status: 'deactivated' });
    expect((await me.api.get('/connections')).body.data.connections).toEqual([]);
  });
});

/* ---------------- interaction logging & events ---------------- */

describe('interaction logging and notification hooks', () => {
  it('logs every lifecycle step to activity_feedback with the request id', async () => {
    const [a, b] = [await member(), await member()];
    const id = await connected(a, b);
    await a.api.delete(`/connections/${id}`);
    await send(b, a);
    await act(b, id, 'cancel');
    await send(a, b);
    await act(b, id, 'reject');

    expect(await activity(id)).toEqual(
      [
        [a, b, 'connection_request'],
        [b, a, 'connection_accepted'],
        [a, b, 'connection_removed'],
        [b, a, 'connection_request'],
        [b, a, 'connection_cancelled'],
        [a, b, 'connection_request'],
        [b, a, 'rejection'],
      ].map(([actor, target, action]) => ({ user_id: actor.userId, target_user_id: target.userId, action }))
    );
  });

  it('does not log refused actions', async () => {
    const [a, b] = [await member(), await member()];
    const id = await pending(a, b);
    await send(a, b); // duplicate
    await act(a, id, 'accept'); // wrong user
    expect(await activity(id)).toHaveLength(1);
  });

  it('emits connection events after the change is committed', async () => {
    const [a, b] = [await member(), await member()];
    const seen = [];
    const listener = (payload) => seen.push(payload);
    connectionEvents.on(CONNECTION_EVENTS.REQUEST_ACCEPTED, listener);
    try {
      const id = await connected(a, b);
      expect(seen).toEqual([expect.objectContaining({ connectionId: id, actorUserId: b.userId, targetUserId: a.userId, status: 'accepted' })]);
    } finally {
      connectionEvents.off(CONNECTION_EVENTS.REQUEST_ACCEPTED, listener);
    }
  });
});

/* ---------------- communication precondition ---------------- */

describe('canUsersCommunicate (Phase 11 chat / Phase 12 video precondition)', () => {
  it('is true only for accepted, unblocked, active connections', async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    const ab = await pending(a, b);
    expect(await connectionService.canUsersCommunicate(a.userId, b.userId)).toBe(false);

    await act(b, ab, 'accept');
    expect(await connectionService.canUsersCommunicate(a.userId, b.userId)).toBe(true);
    expect(await connectionService.canUsersCommunicate(b.userId, a.userId)).toBe(true);
    expect(await connectionService.canUsersCommunicate(a.userId, c.userId)).toBe(false);

    await block(b, a);
    expect(await connectionService.canUsersCommunicate(a.userId, b.userId)).toBe(false);
    await expect(connectionService.assertCanCommunicate(a.userId, b.userId)).rejects.toMatchObject({ statusCode: 403 });
  });
});
