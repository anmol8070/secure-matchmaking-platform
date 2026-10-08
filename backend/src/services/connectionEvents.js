/**
 * Connection lifecycle events — the hook point for notifications.
 *
 * The platform has no notification system yet. connectionService emits one
 * event per state change AFTER its transaction commits, so a listener never
 * sees a change that was rolled back. Phase 11+ (notifications, real-time
 * chat) subscribes here instead of changing connectionService:
 *
 *   connectionEvents.on(CONNECTION_EVENTS.REQUEST_ACCEPTED, ({ actorUserId, targetUserId }) => ...);
 *
 * Payload: { connectionId, actorUserId, targetUserId, status, occurredAt }
 *   actorUserId  — who performed the action
 *   targetUserId — the other member, i.e. the user to notify
 */
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

const CONNECTION_EVENTS = Object.freeze({
  REQUEST_SENT: 'connection.request_sent',
  REQUEST_ACCEPTED: 'connection.request_accepted',
  REQUEST_REJECTED: 'connection.request_rejected',
  REQUEST_CANCELLED: 'connection.request_cancelled',
  CONNECTION_REMOVED: 'connection.removed',
});

const connectionEvents = new EventEmitter();

/**
 * Emits an event. A failing listener is logged and never breaks the API
 * request — the state change has already been committed.
 */
function emitConnectionEvent(name, payload) {
  try {
    connectionEvents.emit(name, { ...payload, occurredAt: new Date().toISOString() });
  } catch (err) {
    logger.error('Connection event listener failed', { event: name, error: err.message });
  }
}

module.exports = { connectionEvents, emitConnectionEvent, CONNECTION_EVENTS };
