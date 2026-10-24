/**
 * Message events — emitted by messageService after a change is saved.
 *
 * The Socket.IO layer (src/sockets) subscribes to push messages, delivery
 * and read receipts to the right users. It is also the integration point
 * for notifications (e.g. "new message" while the receiver is offline):
 * subscribe here instead of changing messageService.
 *
 * Payloads carry the formatted message (for the two participants only) —
 * listeners must not log message text.
 *
 *   MESSAGE_CREATED     { message, conversationId }
 *   MESSAGES_DELIVERED  { conversationId, senderId, receiverId, messageIds, deliveredAt }
 *   MESSAGES_READ       { conversationId, senderId, readerId, messageIds, readAt }
 */
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

const MESSAGE_EVENTS = Object.freeze({
  MESSAGE_CREATED: 'message.created',
  MESSAGES_DELIVERED: 'message.delivered',
  MESSAGES_READ: 'message.read',
});

const messageEvents = new EventEmitter();

function emitMessageEvent(name, payload) {
  try {
    messageEvents.emit(name, payload);
  } catch (err) {
    logger.error('Message event listener failed', { event: name, error: err.message });
  }
}

module.exports = { messageEvents, emitMessageEvent, MESSAGE_EVENTS };
