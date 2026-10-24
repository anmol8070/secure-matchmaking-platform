/**
 * Socket.IO smoke check for private chat (Phase 11) against a RUNNING API.
 * Postman collections cannot script Socket.IO, so this covers the real-time
 * part that Postman folder 13 cannot.
 *
 *   CHAT_SMOKE_URL=http://localhost:5000 \
 *   CHAT_SMOKE_TOKEN_A=<access token of user A> \
 *   CHAT_SMOKE_TOKEN_B=<access token of user B, an ACCEPTED connection of A> \
 *   npm run smoke:chat
 *
 * Checks: both sockets authenticate, a bad token is refused, A joins the
 * conversation, A sends a message (ack after persistence), B receives it in
 * real time and acknowledges it (→ "delivered" for A), B marks it read
 * (→ "read" for A), typing reaches B. Exits 1 on the first failure.
 * The message text is a fixed test string; nothing private is printed.
 */
const { io } = require('socket.io-client');

const url = process.env.CHAT_SMOKE_URL || 'http://localhost:5000';
const tokenA = process.env.CHAT_SMOKE_TOKEN_A;
const tokenB = process.env.CHAT_SMOKE_TOKEN_B;
const TIMEOUT = 5000;

function fail(step, detail) {
  console.error(`✗ ${step}${detail ? ` — ${detail}` : ''}`);
  process.exit(1);
}
const pass = (step) => console.log(`✓ ${step}`);

function open(token) {
  const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

function next(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${TIMEOUT} ms`)), TIMEOUT);
    socket.once(event, (payload, ack) => {
      clearTimeout(timer);
      if (typeof ack === 'function') ack({ received: true });
      resolve(payload);
    });
  });
}

const ask = (socket, event, payload) => socket.timeout(TIMEOUT).emitWithAck(event, payload);

async function main() {
  if (!tokenA || !tokenB) fail('configuration', 'set CHAT_SMOKE_TOKEN_A and CHAT_SMOKE_TOKEN_B');

  try {
    await open('aaa.bbb.ccc');
    fail('invalid token is refused', 'connection was accepted');
  } catch (err) {
    if (!/Invalid or expired token/.test(err.message)) fail('invalid token is refused', err.message);
    pass('invalid token is refused');
  }

  const [a, b] = await Promise.all([open(tokenA), open(tokenB)]).catch((err) => fail('authenticate both users', err.message));
  pass('both users connected');

  // Learn each user's id from a harmless REST call.
  const me = async (token) => {
    const res = await fetch(`${url}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) fail('GET /auth/me', `HTTP ${res.status}`);
    return (await res.json()).data.user_id;
  };
  const [idA, idB] = await Promise.all([me(tokenA), me(tokenB)]);

  const joinA = await ask(a, 'conversation:join', { userId: idB });
  if (!joinA.success || !joinA.canSend) fail('A joins the conversation', joinA.error || 'cannot send (are they connected?)');
  const joinB = await ask(b, 'conversation:join', { userId: idA });
  if (!joinB.success) fail('B joins the conversation', joinB.error);
  pass(`conversation ${joinA.conversationId} joined by both`);

  const typing = next(b, 'typing:start');
  await ask(a, 'typing:start', { userId: idB });
  await typing.catch((err) => fail('typing indicator reaches B', err.message));
  pass('typing indicator reaches B');

  const received = next(b, 'message:received');
  const delivered = next(a, 'message:delivered');
  const sent = await ask(a, 'message:send', { receiverId: idB, message: 'chat smoke test' });
  if (!sent.success) fail('A sends a message', sent.error);
  pass(`message ${sent.message.id} saved and acknowledged`);

  const got = await received.catch((err) => fail('B receives it in real time', err.message));
  if (got.id !== sent.message.id) fail('B receives it in real time', 'different message id');
  pass('B received it in real time');
  await delivered.catch((err) => fail('A is told it was delivered', err.message));
  pass('A was told it was delivered');

  const readReceipt = next(a, 'message:read');
  const read = await ask(b, 'message:read', { messageId: sent.message.id });
  if (!read.success) fail('B marks it read', read.error);
  await readReceipt.catch((err) => fail('A is told it was read', err.message));
  pass('A was told it was read');

  a.disconnect();
  b.disconnect();
  console.log('Chat smoke check passed.');
}

main().catch((err) => fail('unexpected error', err.message));
