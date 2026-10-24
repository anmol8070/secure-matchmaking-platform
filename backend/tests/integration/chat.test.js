/**
 * Phase 11 private chat — real HTTP + real Socket.IO clients against a real
 * database (the *_test database; every table is rebuilt by migrations).
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;
// Chat images go to a throw-away folder, never the real private uploads.
const os = require('os');
const nodeFs = require('fs');
const nodePath = require('path');
config.chatImages.privateDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'chat-images-test-'));

const http = require('http');
const request = require('supertest');
const { io: connectClient } = require('socket.io-client');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const { attachSocketServer, closeSocketServer } = require('../../src/sockets');
const presence = require('../../src/sockets/presence');
const rateLimiter = require('../../src/services/messageRateLimiter');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');

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

const letterName = (n) => `Chat ${String.fromCharCode(65 + (Math.floor(n / 26) % 26))}${String.fromCharCode(97 + (n % 26))}`;

const as = (token) => ({
  get: (p) => request(httpServer).get(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body) => request(httpServer).post(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (p, body) => request(httpServer).put(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  delete: (p) => request(httpServer).delete(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
});

async function member() {
  const email = `chat${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(httpServer).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  await request(httpServer).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const login = await request(httpServer).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
  const done = await request(httpServer)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
  const token = done.body.data.access_token;
  const api = as(token);
  const profile = await api.post('/profile', { name: letterName(seq), dateOfBirth: '1995-05-05', gender: 'female', city: 'Pune' });
  expect(profile.status).toBe(201);
  return { userId: reg.body.data.user_id, email, token, api };
}

/** Sends a connection request a → b and (unless `accept` is false) accepts it. */
async function connect(a, b, { accept = true } = {}) {
  const sent = await a.api.post('/connections', { receiverId: b.userId });
  expect(sent.status).toBe(201);
  const id = sent.body.data.connection.id;
  if (accept) expect((await b.api.put(`/connections/${id}`, { action: 'accept' })).status).toBe(200);
  return id;
}

async function connectedPair() {
  const [a, b] = [await member(), await member()];
  const connectionId = await connect(a, b);
  return { a, b, connectionId };
}

/** Opens an authenticated socket; resolves on connect, rejects on connect_error. */
function openSocket(token, { auth } = {}) {
  const socket = connectClient(baseUrl, {
    auth: auth ?? { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

const emit = (socket, event, payload) => socket.timeout(4000).emitWithAck(event, payload);

/** Resolves with the next `event` payload (and acknowledges it if asked). */
function next(socket, event, { timeout = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeout);
    function handler(payload, ack) {
      clearTimeout(timer);
      socket.off(event, handler);
      if (typeof ack === 'function') ack({ received: true });
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

/** Asserts that `event` does NOT arrive within `ms`. */
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

const waitUntil = async (check, { timeout = 3000 } = {}) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
};

const sendRest = (from, to, message) => from.api.post('/messages', { receiverId: to.userId, message });
const block = (blocker, blocked) => db('blocks').insert({ blocker_id: blocker.userId, blocked_id: blocked.userId });

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
  rateLimiter.reset();
});

afterAll(async () => {
  for (const socket of openSockets) socket.disconnect();
  await closeSocketServer(io);
  await closeConnection();
  nodeFs.rmSync(config.chatImages.privateDir, { recursive: true, force: true });
});

/* ---------------- socket authentication ---------------- */

describe('socket authentication', () => {
  it('refuses connections without a token or with an invalid JWT', async () => {
    await expect(openSocket(null, { auth: {} })).rejects.toThrow('Authentication required');
    await expect(openSocket('not-a-jwt')).rejects.toThrow('Authentication required');
    await expect(openSocket('aaa.bbb.ccc')).rejects.toThrow('Invalid or expired token');
  });

  it('accepts a valid session and refuses it after logout', async () => {
    const a = await member();
    const socket = await openSocket(a.token);
    expect(socket.connected).toBe(true);

    const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
    expect((await a.api.post('/auth/logout')).status).toBe(200);
    await disconnected; // logout closes the session's sockets immediately

    await expect(openSocket(a.token)).rejects.toThrow('Invalid or expired token');
  });

  it('answers unknown events with a controlled error', async () => {
    const a = await member();
    const socket = await openSocket(a.token);
    await expect(emit(socket, 'admin:dump', {})).resolves.toEqual({ success: false, error: 'Unknown event.', code: 400 });
  });
});

/* ---------------- authorization ---------------- */

describe('who may chat', () => {
  it('lets accepted connections join their conversation room', async () => {
    const { a, b, connectionId } = await connectedPair();
    const socket = await openSocket(a.token);
    const ack = await emit(socket, 'conversation:join', { userId: b.userId });
    expect(ack).toEqual({ success: true, conversationId: connectionId, canSend: true, participantOnline: false });
  });

  it('never lets a third user into the conversation', async () => {
    const { a, b } = await connectedPair();
    const stranger = await member();
    const socket = await openSocket(stranger.token);

    for (const target of [a, b]) {
      const ack = await emit(socket, 'conversation:join', { userId: target.userId });
      expect(ack).toMatchObject({ success: false, code: 403 });
    }
    expect((await stranger.api.get(`/messages/${a.userId}`)).status).toBe(403);
    // Typing into a room it never joined is refused too.
    expect(await emit(socket, 'typing:start', { userId: a.userId })).toMatchObject({ success: false, code: 403 });
  });

  it.each([
    ['pending', async (a, b) => connect(a, b, { accept: false })],
    ['rejected', async (a, b) => {
      const id = await connect(a, b, { accept: false });
      await b.api.put(`/connections/${id}`, { action: 'reject' });
    }],
    ['cancelled', async (a, b) => {
      const id = await connect(a, b, { accept: false });
      await a.api.put(`/connections/${id}`, { action: 'cancel' });
    }],
    ['not connected at all', async () => {}],
  ])('refuses messages between %s users (REST and socket)', async (_, setup) => {
    const [a, b] = [await member(), await member()];
    await setup(a, b);

    const rest = await sendRest(a, b, 'Hello');
    expect(rest.status).toBe(403);
    expect(rest.body.message).toBe('Messaging is available only between connected users.');

    const socket = await openSocket(a.token);
    const ack = await emit(socket, 'message:send', { receiverId: b.userId, message: 'Hello' });
    expect(ack).toMatchObject({ success: false, code: 403 });
    expect(await db('messages').where({ sender_id: a.userId })).toHaveLength(0);
  });

  it('refuses messages, history and rooms once either user blocks the other', async () => {
    const { a, b } = await connectedPair();
    expect((await sendRest(a, b, 'before the block')).status).toBe(201);
    await block(b, a);

    for (const [from, to] of [[a, b], [b, a]]) {
      const res = await sendRest(from, to, 'Hi');
      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You cannot message this user.');
      expect((await from.api.get(`/messages/${to.userId}`)).status).toBe(403);
    }
    const socket = await openSocket(a.token);
    expect(await emit(socket, 'conversation:join', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
  });

  it('stops new messages after the connection is removed but keeps the history readable', async () => {
    const { a, b, connectionId } = await connectedPair();
    await sendRest(a, b, 'We were connected');
    const bSocket = await openSocket(b.token);
    await emit(bSocket, 'conversation:join', { userId: a.userId });

    const closed = next(bSocket, 'conversation:closed');
    expect((await a.api.delete(`/connections/${connectionId}`)).status).toBe(200);
    expect(await closed).toEqual({ conversationId: connectionId, canSend: false, reason: 'disconnected' });

    expect((await sendRest(b, a, 'Still there?')).status).toBe(403);
    const history = await b.api.get(`/messages/${a.userId}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toMatchObject({ canSend: false, messages: [expect.objectContaining({ message: 'We were connected' })] });
  });

  it('takes the sender from the token, never from the payload', async () => {
    const { a, b } = await connectedPair();
    const socket = await openSocket(a.token);
    const ack = await emit(socket, 'message:send', { receiverId: b.userId, senderId: b.userId, message: 'Who sent this?' });
    expect(ack.success).toBe(true);
    const row = await db('messages').where({ message_id: ack.message.id }).first();
    expect([Number(row.sender_id), Number(row.receiver_id)]).toEqual([a.userId, b.userId]);

    const rest = await a.api.post('/messages', { receiverId: b.userId, senderId: b.userId, message: 'REST too' });
    expect(rest.body.data.message.senderId).toBe(a.userId);
  });

  it('refuses messages to yourself and to unknown users', async () => {
    const a = await member();
    expect((await sendRest(a, a, 'me')).status).toBe(400);
    expect((await a.api.post('/messages', { receiverId: 999999999, message: 'hi' })).status).toBe(404);
  });
});

/* ---------------- real-time delivery ---------------- */

describe('real-time messaging', () => {
  it('persists, acknowledges and delivers a message in real time, then the reply comes back', async () => {
    const { a, b, connectionId } = await connectedPair();
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    await emit(aSocket, 'conversation:join', { userId: b.userId });

    const received = next(bSocket, 'message:received');
    const delivered = next(aSocket, 'message:delivered');
    const ack = await emit(aSocket, 'message:send', { receiverId: b.userId, message: '  Hello!  ' });

    expect(ack).toEqual({
      success: true,
      message: {
        id: expect.any(Number),
        conversationId: connectionId,
        senderId: a.userId,
        receiverId: b.userId,
        type: 'text',
        message: 'Hello!',
        image: null,
        status: 'sent',
        createdAt: expect.any(String),
        deliveredAt: null,
        readAt: null,
      },
    });
    // Saved before anything was emitted.
    expect((await db('messages').where({ message_id: ack.message.id }).first()).message).toBe('Hello!');

    expect(await received).toMatchObject({ id: ack.message.id, message: 'Hello!', senderId: a.userId });
    expect(await delivered).toMatchObject({ messageIds: [ack.message.id], senderId: a.userId, receiverId: b.userId });
    await waitUntil(async () => (await db('messages').where({ message_id: ack.message.id }).first()).delivered_at !== null);

    const reply = next(aSocket, 'message:received');
    const replyAck = await emit(bSocket, 'message:send', { receiverId: a.userId, message: "Hi! I'm good." });
    expect(replyAck.success).toBe(true);
    expect(await reply).toMatchObject({ id: replyAck.message.id, senderId: b.userId });
  });

  it('pushes REST-sent messages to the receiver socket too', async () => {
    const { a, b } = await connectedPair();
    const bSocket = await openSocket(b.token);
    const received = next(bSocket, 'message:received');
    const res = await sendRest(a, b, 'via REST');
    expect(res.status).toBe(201);
    expect(await received).toMatchObject({ id: res.body.data.message.id });
  });

  it('reaches every device of the receiver and the sender’s other devices', async () => {
    const { a, b } = await connectedPair();
    const [a1, a2, b1, b2] = [await openSocket(a.token), await openSocket(a.token), await openSocket(b.token), await openSocket(b.token)];
    expect(await presence.socketCount(io, b.userId)).toBe(2);

    const arrivals = [next(b1, 'message:received'), next(b2, 'message:received'), next(a2, 'message:received')];
    const ack = await emit(a1, 'message:send', { receiverId: b.userId, message: 'to all devices' });
    for (const payload of await Promise.all(arrivals)) expect(payload.id).toBe(ack.message.id);
  });

  it('never broadcasts a private message to unrelated users', async () => {
    const { a, b } = await connectedPair();
    const stranger = await member();
    const strangerSocket = await openSocket(stranger.token);
    const quiet = silence(strangerSocket, 'message:received');
    await sendRest(a, b, 'secret');
    await quiet;
  });

  it('stores messages for an offline receiver, who gets them from history later', async () => {
    const { a, b } = await connectedPair();
    const aSocket = await openSocket(a.token);
    const ack = await emit(aSocket, 'message:send', { receiverId: b.userId, message: 'Are you there?' });
    expect(ack.message.status).toBe('sent');
    await new Promise((r) => setTimeout(r, 200));
    expect((await db('messages').where({ message_id: ack.message.id }).first()).delivered_at).toBeNull();

    const delivered = next(aSocket, 'message:delivered');
    const history = await b.api.get(`/messages/${a.userId}`);
    expect(history.body.data.messages).toEqual([expect.objectContaining({ id: ack.message.id, status: 'delivered' })]);
    expect(await delivered).toMatchObject({ messageIds: [ack.message.id] });
  });

  it('relays typing indicators inside the conversation only, without storing them', async () => {
    const { a, b, connectionId } = await connectedPair();
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    await emit(aSocket, 'conversation:join', { userId: b.userId });
    await emit(bSocket, 'conversation:join', { userId: a.userId });

    const typing = next(bSocket, 'typing:start');
    expect(await emit(aSocket, 'typing:start', { userId: b.userId })).toEqual({ success: true });
    expect(await typing).toEqual({ userId: a.userId, conversationId: connectionId });
    expect(await db('messages').where({ sender_id: a.userId })).toHaveLength(0);
  });

  it('tracks presence per user across several sockets', async () => {
    const { a, b } = await connectedPair();
    const bSocket = await openSocket(b.token);
    await emit(bSocket, 'conversation:join', { userId: a.userId });
    const [a1, a2] = [await openSocket(a.token), await openSocket(a.token)];
    const join = await emit(a1, 'conversation:join', { userId: b.userId });
    expect(join.participantOnline).toBe(true);

    const quiet = silence(bSocket, 'presence:update', 300);
    a2.disconnect(); // a1 still online → no offline event
    await quiet;

    const offline = next(bSocket, 'presence:update');
    a1.disconnect();
    expect(await offline).toEqual({ userId: a.userId, online: false });
  });
});

/* ---------------- history, ordering, pagination ---------------- */

describe('message history', () => {
  it('returns the conversation oldest → newest with a stable cursor', async () => {
    const { a, b, connectionId } = await connectedPair();
    const texts = [];
    for (let i = 1; i <= 7; i += 1) {
      const [from, to] = i % 2 ? [a, b] : [b, a];
      texts.push(`message ${i}`);
      expect((await sendRest(from, to, `message ${i}`)).status).toBe(201);
    }

    const page1 = (await a.api.get(`/messages/${b.userId}?limit=3`)).body.data;
    expect(page1.conversationId).toBe(connectionId);
    expect(page1.participant).toEqual({ userId: b.userId, name: expect.any(String), profilePicture: null, age: expect.any(Number), location: 'Pune' });
    expect(page1.messages.map((m) => m.message)).toEqual(['message 5', 'message 6', 'message 7']);
    expect(page1.pagination).toMatchObject({ limit: 3, hasMore: true });

    const page2 = (await a.api.get(`/messages/${b.userId}?limit=3&before=${page1.pagination.nextCursor}`)).body.data;
    const page3 = (await a.api.get(`/messages/${b.userId}?limit=3&before=${page2.pagination.nextCursor}`)).body.data;
    expect(page3.pagination).toMatchObject({ hasMore: false, nextCursor: null });

    const all = [...page3.messages, ...page2.messages, ...page1.messages].map((m) => m.message);
    expect(all).toEqual(texts); // no duplicates, no gaps, chronological
  });

  it('rejects unreasonable pagination', async () => {
    const { a, b } = await connectedPair();
    for (const query of ['limit=0', `limit=${config.messages.maxLimit + 1}`, 'limit=abc', 'before=-1']) {
      expect((await a.api.get(`/messages/${b.userId}?${query}`)).status).toBe(422);
    }
  });

  it('lists conversations with the last message and unread count', async () => {
    const { a, b } = await connectedPair();
    await sendRest(b, a, 'one');
    await sendRest(b, a, 'two');
    const list = (await a.api.get('/messages/conversations')).body.data.conversations;
    expect(list).toEqual([
      expect.objectContaining({ participant: expect.objectContaining({ userId: b.userId }), canSend: true, unreadCount: 2, lastMessage: expect.objectContaining({ message: 'two' }) }),
    ]);
  });

  it('never exposes private profile or account fields', async () => {
    const { a, b } = await connectedPair();
    await sendRest(a, b, 'hello');
    const bodies = [await a.api.get(`/messages/${b.userId}`), await a.api.get('/messages/conversations')].map((r) => JSON.stringify(r.body));
    for (const body of bodies) {
      expect(body).not.toContain(b.email);
      expect(body).not.toMatch(/password|otp|mobile|session|date_of_birth|1995-05-05/i);
    }
  });
});

/* ---------------- read receipts ---------------- */

describe('read receipts', () => {
  it('lets only the receiver mark messages read, and tells the sender', async () => {
    const { a, b } = await connectedPair();
    const first = (await sendRest(a, b, 'first')).body.data.message;
    const second = (await sendRest(a, b, 'second')).body.data.message;
    const stranger = await member();

    expect((await a.api.put(`/messages/${second.id}/read`)).status).toBe(403); // own message
    expect((await stranger.api.put(`/messages/${second.id}/read`)).status).toBe(404);
    expect((await a.api.put('/messages/999999999/read')).status).toBe(404);

    const aSocket = await openSocket(a.token);
    const bSocket = await openSocket(b.token);
    const receipt = next(aSocket, 'message:read');
    const ack = await emit(bSocket, 'message:read', { messageId: second.id });
    expect(ack).toMatchObject({ success: true, read: { messageIds: [first.id, second.id], readerId: b.userId } });
    expect(await receipt).toMatchObject({ messageIds: [first.id, second.id], senderId: a.userId });

    const history = (await a.api.get(`/messages/${b.userId}`)).body.data.messages;
    expect(history.map((m) => m.status)).toEqual(['read', 'read']);
    expect((await a.api.get('/messages/conversations')).body.data.conversations[0].unreadCount).toBe(0);
  });
});

/* ---------------- validation, XSS, rate limits ---------------- */

describe('validation and abuse protection', () => {
  it('validates message payloads on both paths', async () => {
    const { a, b } = await connectedPair();
    const socket = await openSocket(a.token);
    const tooLong = 'x'.repeat(config.messages.maxLength + 1);

    for (const body of [{ receiverId: b.userId, message: '   ' }, { receiverId: b.userId, message: tooLong }, { receiverId: b.userId }, { message: 'hi' }, { receiverId: b.userId, message: 'hi', type: 'image' }, { receiverId: 'abc', message: 'hi' }]) {
      expect((await a.api.post('/messages', body)).status).toBe(422);
      expect(await emit(socket, 'message:send', body)).toMatchObject({ success: false, code: 422 });
    }
    expect(await emit(socket, 'message:send', 'not an object')).toMatchObject({ success: false, code: 422 });
    expect(await db('messages').where({ sender_id: a.userId })).toHaveLength(0);
  });

  it('stores markup as plain text, exactly as typed', async () => {
    const { a, b } = await connectedPair();
    const payload = '<script>alert(1)</script><img src=x onerror="alert(2)"> & "quotes"';
    const sent = (await sendRest(a, b, payload)).body.data.message;
    expect(sent.message).toBe(payload);
    expect((await b.api.get(`/messages/${a.userId}`)).body.data.messages[0].message).toBe(payload);
  });

  it('rate-limits sending with one budget shared by REST and Socket.IO', async () => {
    const { a, b } = await connectedPair();
    const original = config.messages.rateLimit;
    config.messages.rateLimit = 3;
    try {
      const socket = await openSocket(a.token);
      expect((await sendRest(a, b, '1')).status).toBe(201);
      expect((await emit(socket, 'message:send', { receiverId: b.userId, message: '2' })).success).toBe(true);
      expect((await sendRest(a, b, '3')).status).toBe(201);

      const limited = await sendRest(a, b, '4');
      expect(limited.status).toBe(429);
      expect(limited.body.message).toMatch(/too quickly/);
      expect(await emit(socket, 'message:send', { receiverId: b.userId, message: '5' })).toMatchObject({ success: false, code: 429 });
      // Other users are not affected.
      expect((await sendRest(b, a, 'reply')).status).toBe(201);
    } finally {
      config.messages.rateLimit = original;
    }
  });
});

/* ---------------- image messages ---------------- */

describe('image messages', () => {
  const fsp = require('fs/promises');
  const path = require('path');
  const sharp = require('sharp');

  // A small JPEG with EXIF metadata that must not survive re-encoding.
  const jpeg = () =>
    sharp({ create: { width: 640, height: 480, channels: 3, background: '#3a7bd5' } })
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-camera-owner' } } })
      .jpeg()
      .toBuffer();

  const sendImage = (from, to, buffer, { caption, filename = 'photo.jpg', contentType = 'image/jpeg' } = {}) => {
    const req = request(httpServer)
      .post('/api/v1/messages/images')
      .set('Authorization', `Bearer ${from.token}`)
      .field('receiverId', String(to.userId));
    if (caption !== undefined) req.field('caption', caption);
    return buffer ? req.attach('image', buffer, { filename, contentType }) : req;
  };

  const getImage = (user, imagePath) =>
    request(httpServer)
      .get(`/api/v1${imagePath}`)
      .set('Authorization', `Bearer ${user.token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  const storedFiles = () => fsp.readdir(path.join(config.chatImages.privateDir, 'chat-images')).catch(() => []);

  it('sends an image with a caption, delivers it in real time and serves it to participants only', async () => {
    const { a, b, connectionId } = await connectedPair();
    const bSocket = await openSocket(b.token);
    const received = next(bSocket, 'message:received');

    const res = await sendImage(a, b, await jpeg(), { caption: '  Look at this!  ' });
    expect(res.status).toBe(201);
    const message = res.body.data.message;
    expect(message).toMatchObject({
      conversationId: connectionId,
      type: 'image',
      message: 'Look at this!',
      image: { path: `/messages/${message.id}/image`, contentType: 'image/webp', width: 640, height: 480, size: expect.any(Number) },
    });
    expect(await received).toMatchObject({ id: message.id, type: 'image', image: { path: message.image.path } });

    // Stored privately: not under the public uploads folder, and the key never leaves the API.
    const row = await db('messages').where({ message_id: message.id }).first();
    expect(JSON.stringify(res.body)).not.toContain(row.attachment_key);
    await expect(fsp.access(path.join(config.chatImages.privateDir, row.attachment_key))).resolves.toBeUndefined();
    await expect(fsp.access(path.join(config.media.uploadsDir, row.attachment_key))).rejects.toThrow();
    expect((await request(httpServer).get(`/media/${row.attachment_key}`)).status).toBe(404);

    for (const user of [a, b]) {
      const file = await getImage(user, message.image.path);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('image/webp');
      expect(file.headers['cache-control']).toBe('private, max-age=3600');
      expect(file.body.toString('ascii', 0, 4)).toBe('RIFF');
      expect(file.body.includes(Buffer.from('secret-camera-owner'))).toBe(false); // EXIF stripped
    }
    const stranger = await member();
    expect((await getImage(stranger, message.image.path)).status).toBe(404);
    expect((await request(httpServer).get(`/api/v1${message.image.path}`)).status).toBe(401);

    await block(b, a);
    expect((await getImage(a, message.image.path)).status).toBe(403);
  });

  it('shows image messages in history and the conversation list', async () => {
    const { a, b } = await connectedPair();
    const sent = (await sendImage(a, b, await jpeg())).body.data.message;
    expect(sent.message).toBe('');

    const history = (await b.api.get(`/messages/${a.userId}`)).body.data.messages;
    expect(history).toEqual([expect.objectContaining({ id: sent.id, type: 'image', image: expect.objectContaining({ path: sent.image.path }) })]);
    const list = (await b.api.get('/messages/conversations')).body.data.conversations;
    expect(list[0].lastMessage).toMatchObject({ type: 'image', message: '' });
  });

  it('refuses images between users who may not chat, before storing anything', async () => {
    const [a, b] = [await member(), await member()];
    await connect(a, b, { accept: false });
    const before = await storedFiles();

    const res = await sendImage(a, b, await jpeg());
    expect(res.status).toBe(403);
    expect((await storedFiles()).length).toBe(before.length);
    expect(await db('messages').where({ sender_id: a.userId })).toHaveLength(0);
  });

  it('validates the upload', async () => {
    const { a, b } = await connectedPair();
    expect((await sendImage(a, b, null)).status).toBe(422); // no file
    const fake = Buffer.from('<script>alert(1)</script>');
    expect((await sendImage(a, b, fake, { filename: 'x.png', contentType: 'image/png' })).status).toBe(415);
    expect((await sendImage(a, b, await jpeg(), { filename: 'photo.gif', contentType: 'image/gif' })).status).toBe(415);
    const tooBig = Buffer.alloc(Math.round(config.chatImages.maxSizeMb * 1024 * 1024) + 1024, 1);
    expect((await sendImage(a, b, tooBig, { filename: 'big.jpg' })).status).toBe(413);
    expect((await sendImage(a, b, await jpeg(), { caption: 'x'.repeat(config.messages.maxLength + 1) })).status).toBe(422);

    // Images cannot be smuggled through the JSON/socket text path.
    const socket = await openSocket(a.token);
    expect(await emit(socket, 'message:send', { receiverId: b.userId, message: 'x', type: 'image' })).toMatchObject({ success: false, code: 422 });
    expect(await db('messages').where({ sender_id: a.userId })).toHaveLength(0);
  });
});

/* ---------------- blocking (API) ---------------- */

describe('blocking through the API', () => {
  it('blocks and unblocks idempotently and lists blocked users', async () => {
    const [a, b] = [await member(), await member()];
    expect((await a.api.post('/blocks', { userId: b.userId })).status).toBe(201);
    expect((await a.api.post('/blocks', { userId: b.userId })).status).toBe(200);
    expect((await a.api.post('/blocks', { userId: a.userId })).status).toBe(400);
    expect((await a.api.post('/blocks', { userId: 999999999 })).status).toBe(404);
    expect((await a.api.post('/blocks', { userId: 'abc' })).status).toBe(422);

    const list = (await a.api.get('/blocks')).body.data.blocks;
    expect(list).toEqual([{ userId: b.userId, user: expect.objectContaining({ userId: b.userId }), blockedAt: expect.any(String), reason: null }]);
    expect((await b.api.get('/blocks')).body.data.blocks).toEqual([]);

    expect((await a.api.delete(`/blocks/${b.userId}`)).status).toBe(200);
    expect((await a.api.delete(`/blocks/${b.userId}`)).status).toBe(404);
  });

  it('closes an open conversation immediately; unblocking does not restore the connection', async () => {
    const { a, b, connectionId } = await connectedPair();
    const [aSocket, bSocket] = [await openSocket(a.token), await openSocket(b.token)];
    await emit(aSocket, 'conversation:join', { userId: b.userId });
    await emit(bSocket, 'conversation:join', { userId: a.userId });

    const closed = next(aSocket, 'conversation:closed');
    expect((await b.api.post('/blocks', { userId: a.userId })).status).toBe(201);
    expect(await closed).toEqual({ conversationId: connectionId, canSend: false, reason: 'unavailable' });

    // Out of the room: typing, messages and re-joining are refused.
    expect(await emit(aSocket, 'typing:start', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
    expect(await emit(aSocket, 'message:send', { receiverId: b.userId, message: 'hi' })).toMatchObject({ success: false, code: 403 });
    expect(await emit(aSocket, 'conversation:join', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
    expect((await a.api.get(`/connections/status/${b.userId}`)).body.data.state).toBe('unavailable');

    // Phase 13: blocking ended the connection, so unblocking restores nothing.
    expect((await db('connection_requests').where({ request_id: connectionId }).first()).status).toBe('disconnected');
    expect((await b.api.delete(`/blocks/${a.userId}`)).status).toBe(200);
    expect(await emit(aSocket, 'conversation:join', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
    expect((await sendRest(a, b, 'friends again')).status).toBe(403);
    // They can connect again normally, and then chat.
    const again = await connect(a, b);
    expect(again).toBe(connectionId);
    expect((await sendRest(a, b, 'friends again')).status).toBe(201);
  });

  it('stops typing in a conversation whose connection was removed', async () => {
    const { a, b, connectionId } = await connectedPair();
    await sendRest(a, b, 'history');
    const aSocket = await openSocket(a.token);
    await emit(aSocket, 'conversation:join', { userId: b.userId });

    const closed = next(aSocket, 'conversation:closed');
    await b.api.delete(`/connections/${connectionId}`);
    await closed;
    expect(await emit(aSocket, 'typing:start', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
    // History is still readable: re-joining works, but read-only.
    expect(await emit(aSocket, 'conversation:join', { userId: b.userId })).toMatchObject({ success: true, canSend: false });
    expect(await emit(aSocket, 'typing:start', { userId: b.userId })).toMatchObject({ success: false, code: 403 });
  });
});
