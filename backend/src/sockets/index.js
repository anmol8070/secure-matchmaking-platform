/**
 * Socket.IO server for private real-time chat (Phase 11), attached to the
 * existing Express HTTP server (no second backend).
 *
 * Flow:
 *   handshake ─▶ authenticate (same JWT + server-side session as REST)
 *             ─▶ join user:<id> and session:<id> rooms (multi-device)
 *   conversation:join { userId } ─▶ messageService access check (Phase 10
 *             canUsersCommunicate + block) ─▶ join conversation:<id>
 *   message:send ─▶ validate ─▶ messageService.sendMessage (persist first)
 *             ─▶ ack to sender ─▶ message:received to both users' rooms
 *
 * The acting user is ALWAYS socket.data.userId from the verified token —
 * ids inside payloads only name the OTHER user. Clients never name a room;
 * the server resolves it after the authorization check.
 */
const { Server } = require('socket.io');
const config = require('../config/environment');
const { buildCorsOptions } = require('../config/cors');
const sessionService = require('../services/sessionService');
const messageService = require('../services/messageService');
const { messageEvents, MESSAGE_EVENTS } = require('../services/messageEvents');
const { connectionEvents, CONNECTION_EVENTS } = require('../services/connectionEvents');
const { blockEvents, BLOCK_EVENTS } = require('../services/blockService');
const { ConnectionRequest } = require('../models');
const redisConfig = require('../config/redis');
const { sendMessageBody, userTarget, readPayload } = require('../validators/messageValidator');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { describeDbError } = require('../utils/dbErrors');
const presence = require('./presence');
const privacyService = require('../services/privacyService');
const calls = require('./callSocket');
const realtime = require('./realtime');
const EVENTS = require('./events');

const { rooms } = realtime;
const DELIVERY_ACK_TIMEOUT_MS = 5000;
// Largest accepted socket frame: a WebRTC SDP offer (capped at 48 KB by
// callValidator) or a maximum-length chat message, plus JSON overhead.
const MAX_PAYLOAD_BYTES = 64 * 1024;
const JWT_SHAPE = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/;
const CLIENT_EVENTS = new Set([
  EVENTS.CONVERSATION_JOIN,
  EVENTS.CONVERSATION_LEAVE,
  EVENTS.MESSAGE_SEND,
  EVENTS.MESSAGE_READ,
  EVENTS.TYPING_START,
  EVENTS.TYPING_STOP,
  ...Object.values(calls.CALL_EVENTS_IN),
]);

function authError(message) {
  const err = new Error(message);
  err.data = { code: 401 };
  return err;
}

function tokenFrom(handshake) {
  const fromAuth = handshake.auth && handshake.auth.token;
  if (typeof fromAuth === 'string') return fromAuth.replace(/^Bearer\s+/i, '').trim();
  const header = handshake.headers && handshake.headers.authorization;
  if (typeof header === 'string' && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return null;
}

/** Handshake middleware: no valid token + live session → connection refused. */
async function authenticateSocket(socket, next) {
  const token = tokenFrom(socket.handshake);
  if (!token || !JWT_SHAPE.test(token)) return next(authError('Authentication required'));
  try {
    const { user, session } = await sessionService.authenticate(token);
    socket.data.userId = Number(user.user_id);
    socket.data.sessionId = session.session_id;
    socket.data.expiresAt = new Date(session.expires_at).getTime();
    socket.data.conversations = new Map(); // otherUserId → { conversationId, canSend } (set after authorization)
    return next();
  } catch {
    return next(authError('Invalid or expired token'));
  }
}

/** Parses a payload or throws a 422 ApiError (never echoes the payload). */
function parse(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    throw ApiError.validation(result.error.issues.map((i) => ({ field: i.path.join('.') || 'payload', message: i.message })));
  }
  return result.data;
}

/** Controlled error for an acknowledgement — no stack traces, no DB details. */
function toAckError(err, event, socket, fallback) {
  if (err instanceof ApiError) {
    return { success: false, error: err.message, code: err.statusCode, ...(err.errors && { errors: err.errors }) };
  }
  logger.error('Socket event failed', { event, userId: socket.data.userId, error: err.name, db: describeDbError(err) });
  return { success: false, error: fallback, code: 500 };
}

/**
 * Wraps a handler: checks the session has not expired, runs it, and answers
 * the client's acknowledgement callback with { success, ... }.
 */
function handle(socket, event, handler, fallback = 'Unable to process request.') {
  socket.on(event, async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (Date.now() >= socket.data.expiresAt) {
      reply({ success: false, error: 'Session has expired. Please log in again.', code: 401 });
      socket.disconnect(true);
      return;
    }
    try {
      reply({ success: true, ...((await handler(payload)) || {}) });
    } catch (err) {
      reply(toAckError(err, event, socket, fallback));
    }
  });
}

function registerChatHandlers(io, socket) {
  const me = socket.data.userId;

  handle(socket, EVENTS.CONVERSATION_JOIN, async (payload) => {
    const { userId } = parse(userTarget, payload);
    const access = await messageService.getConversationAccess(me, userId);
    if (!access.canRead || !access.conversationId) throw ApiError.forbidden(messageService.MESSAGES.NOT_CONNECTED);

    const room = rooms.conversation(access.conversationId);
    await socket.join(room);
    socket.data.conversations.set(Number(userId), { conversationId: access.conversationId, canSend: access.canSend, otherUserId: Number(userId) });
    // Online status follows each user's onlineStatusVisibility (Phase 13): null = not shared.
    if (await privacyService.canViewOnlineStatus(userId, me)) socket.to(room).emit(EVENTS.PRESENCE_UPDATE, { userId: me, online: true });
    const participantOnline = (await privacyService.canViewOnlineStatus(me, userId)) ? await presence.isOnline(io, userId) : null;
    return { conversationId: access.conversationId, canSend: access.canSend, participantOnline };
  });

  handle(socket, EVENTS.CONVERSATION_LEAVE, async (payload) => {
    const { userId } = parse(userTarget, payload);
    const entry = socket.data.conversations.get(Number(userId));
    if (entry) {
      await socket.leave(rooms.conversation(entry.conversationId));
      socket.data.conversations.delete(Number(userId));
    }
    return {};
  });

  handle(
    socket,
    EVENTS.MESSAGE_SEND,
    async (payload) => {
      const input = parse(sendMessageBody, payload);
      // senderId is never read from the payload.
      const message = await messageService.sendMessage(me, input);
      return { message };
    },
    'Unable to send message.'
  );

  handle(socket, EVENTS.MESSAGE_READ, async (payload) => {
    const { messageId } = parse(readPayload, payload);
    return { read: await messageService.markMessageRead(me, messageId) };
  });

  // Typing indicators: relayed only inside a conversation this socket joined
  // with send permission, and still belongs to (blocks and removed connections
  // take every socket out of the room). Never stored.
  for (const event of [EVENTS.TYPING_START, EVENTS.TYPING_STOP]) {
    handle(socket, event, async (payload) => {
      const { userId } = parse(userTarget, payload);
      const entry = socket.data.conversations.get(Number(userId));
      const room = entry && rooms.conversation(entry.conversationId);
      if (!entry || !socket.rooms.has(room)) throw ApiError.forbidden('Join the conversation first.');
      if (!entry.canSend) throw ApiError.forbidden(messageService.MESSAGES.NOT_CONNECTED);
      socket.to(room).emit(event, { userId: me, conversationId: entry.conversationId });
      return {};
    });
  }

  socket.onAny((event, ...args) => {
    if (CLIENT_EVENTS.has(event)) return;
    const ack = args[args.length - 1];
    const error = { success: false, error: 'Unknown event.', code: 400 };
    if (typeof ack === 'function') ack(error);
    else socket.emit(EVENTS.CHAT_ERROR, { event: String(event).slice(0, 64), ...error });
  });

  socket.on('disconnect', async () => {
    try {
      if (await presence.isOnline(io, me)) return; // another tab/device is still connected
      for (const { conversationId, otherUserId } of socket.data.conversations.values()) {
        if (!(await privacyService.canViewOnlineStatus(otherUserId, me))) continue;
        io.to(rooms.conversation(conversationId)).emit(EVENTS.PRESENCE_UPDATE, { userId: me, online: false });
      }
    } catch (err) {
      logger.warn('Presence update failed', { userId: me, error: err.name });
    }
  });
}

/** Bridges service events (emitted after the DB write) to the right users. */
function bridgeServiceEvents(io) {
  const onCreated = ({ message }) => {
    // Sender's other tabs/devices get it too; clients de-duplicate by id.
    io.to(rooms.user(message.senderId)).emit(EVENTS.MESSAGE_RECEIVED, message);
    // Delivered = a receiver device acknowledged it (not merely "online").
    io.to(rooms.user(message.receiverId))
      .timeout(DELIVERY_ACK_TIMEOUT_MS)
      .emit(EVENTS.MESSAGE_RECEIVED, message, (err, responses) => {
        if (!responses || responses.length === 0) return; // offline: stays "sent", fetched later
        messageService
          .markMessagesDelivered(message.receiverId, message.senderId, { upToId: message.id, conversationId: message.conversationId })
          .catch((e) => logger.error('Marking delivery failed', { id: message.id, error: e.name }));
      });
  };
  const onDelivered = (event) => io.to(rooms.user(event.senderId)).emit(EVENTS.MESSAGE_DELIVERED, event);
  const onRead = (event) => io.to(rooms.user(event.senderId)).to(rooms.user(event.readerId)).emit(EVENTS.MESSAGES_READ, event);
  // The pair may no longer chat: tell the open chats, then take every socket out
  // of the room (typing stops; re-joining re-checks permission).
  const closeConversation = (conversationId, reason) => {
    const room = rooms.conversation(conversationId);
    io.to(room).emit(EVENTS.CONVERSATION_CLOSED, { conversationId: Number(conversationId), canSend: false, reason });
    io.in(room).socketsLeave(room);
  };
  const onRemoved = ({ connectionId }) => closeConversation(connectionId, 'disconnected');
  const onBlocked = async ({ blockerId, blockedId }) => {
    try {
      const relationship = await ConnectionRequest.findBetween(blockerId, blockedId);
      if (relationship) closeConversation(relationship.request_id, 'unavailable');
    } catch (err) {
      logger.error('Closing blocked conversation failed', { error: err.name });
    }
  };

  messageEvents.on(MESSAGE_EVENTS.MESSAGE_CREATED, onCreated);
  messageEvents.on(MESSAGE_EVENTS.MESSAGES_DELIVERED, onDelivered);
  messageEvents.on(MESSAGE_EVENTS.MESSAGES_READ, onRead);
  connectionEvents.on(CONNECTION_EVENTS.CONNECTION_REMOVED, onRemoved);
  blockEvents.on(BLOCK_EVENTS.BLOCKED, onBlocked);

  return () => {
    messageEvents.off(MESSAGE_EVENTS.MESSAGE_CREATED, onCreated);
    messageEvents.off(MESSAGE_EVENTS.MESSAGES_DELIVERED, onDelivered);
    messageEvents.off(MESSAGE_EVENTS.MESSAGES_READ, onRead);
    connectionEvents.off(CONNECTION_EVENTS.CONNECTION_REMOVED, onRemoved);
    blockEvents.off(BLOCK_EVENTS.BLOCKED, onBlocked);
  };
}

/**
 * With REDIS_URL, events/rooms/presence are shared by every API instance
 * through the Socket.IO Redis adapter. Without it, the in-memory adapter is
 * used (single instance).
 */
async function useRedisAdapter(io) {
  if (!redisConfig.isEnabled()) return;
  const { createAdapter } = require('@socket.io/redis-adapter');
  const pub = redisConfig.createRedisClient();
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  io.redisClients = [pub, sub];
  logger.info('Socket.IO is using the Redis adapter');
}

/**
 * Attaches Socket.IO to an HTTP server. Returns the io instance; await
 * io.ready before accepting traffic, and call closeSocketServer(io) on shutdown.
 */
function attachSocketServer(httpServer, { corsOrigins = config.corsOrigins } = {}) {
  const io = new Server(httpServer, {
    cors: buildCorsOptions(corsOrigins),
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    serveClient: false,
  });

  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    const { userId, sessionId } = socket.data;
    socket.join([rooms.user(userId), rooms.session(sessionId)]);
    registerChatHandlers(io, socket);
    calls.registerCallHandlers(io, socket, { handle, parse });
  });

  const detachChat = bridgeServiceEvents(io);
  const detachCalls = calls.bridgeCallEvents(io);
  const sweep = calls.startCallSweep(io);
  io.callSweep = sweep;
  io.detachServiceEvents = () => {
    detachChat();
    detachCalls();
    sweep.stop();
  };
  io.ready = useRedisAdapter(io);
  realtime.setServer(io);
  return io;
}

async function closeSocketServer(io) {
  if (!io) return;
  io.detachServiceEvents?.();
  if (realtime.getServer() === io) realtime.setServer(null);
  await new Promise((resolve) => io.close(() => resolve()));
  for (const client of io.redisClients || []) await client.quit().catch(() => {});
}

module.exports = { attachSocketServer, closeSocketServer, EVENTS };
