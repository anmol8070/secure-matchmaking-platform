/**
 * Socket.IO event names (Phase 11) — the single list shared by the server;
 * the frontend mirrors it in src/services/socketService.js.
 * Documented in docs/phase-11-chat.md.
 */
module.exports = Object.freeze({
  // client → server (each takes an acknowledgement callback)
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_READ: 'message:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // server → client
  MESSAGE_RECEIVED: 'message:received', // client acks it → message becomes "delivered"
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGES_READ: 'message:read',
  PRESENCE_UPDATE: 'presence:update',
  CONVERSATION_CLOSED: 'conversation:closed',
  CHAT_ERROR: 'chat:error',
});
