/**
 * The app's single Socket.IO connection (Phase 11 private chat).
 *
 * - One authenticated socket per app session, created on first use and
 *   shared by every page; closed on logout or session expiry.
 * - The access token is read on every (re)connect, so reconnection always
 *   uses the current session. The server verifies it; nothing here is trusted.
 * - Components subscribe with on(event, handler) and must call the returned
 *   unsubscribe function on unmount.
 */
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants.js';
import { tokenStore } from './tokenStore.js';

export const SOCKET_EVENTS = Object.freeze({
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  PRESENCE_UPDATE: 'presence:update',
  CONVERSATION_CLOSED: 'conversation:closed',
  // Video calls (Phase 12)
  CALL_INITIATE: 'call:initiate',
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPT: 'call:accept',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECT: 'call:reject',
  CALL_JOIN: 'call:join',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE: 'call:ice-candidate',
  CALL_CONNECTED: 'call:connected',
  CALL_FAILED: 'call:failed',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_BUSY: 'call:busy',
  CALL_PEER_LEFT: 'call:peer-left',
  CALL_PEER_REJOINED: 'call:peer-rejoined',
});

const ACK_TIMEOUT_MS = 8000;
// Socket.IO lives on the API server's origin (API_BASE_URL minus /api/v1).
const SOCKET_URL = new URL(API_BASE_URL).origin;

let socket = null;

function connect() {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    auth: (callback) => callback({ token: tokenStore.get() }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  });
  return socket;
}

function disconnect() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/** Subscribes to a server event; returns the unsubscribe function. */
function on(event, handler) {
  const s = connect();
  s.on(event, handler);
  return () => s.off(event, handler);
}

/** Runs `handler` on every (re)connection, and now if already connected. */
function onConnect(handler) {
  const s = connect();
  s.on('connect', handler);
  if (s.connected) handler();
  return () => s.off('connect', handler);
}

/**
 * Emits with an acknowledgement. Resolves with the server's
 * { success, ... } reply; a timeout resolves as a controlled failure.
 */
async function request(event, payload) {
  const s = connect();
  try {
    return await s.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload);
  } catch {
    return { success: false, error: 'The chat server did not respond. Please try again.', code: 0 };
  }
}

/** Fire-and-forget event (typing indicators). */
function emit(event, payload) {
  connect().emit(event, payload);
}

const isConnected = () => Boolean(socket?.connected);

export const socketService = { connect, disconnect, on, onConnect, request, emit, isConnected };
