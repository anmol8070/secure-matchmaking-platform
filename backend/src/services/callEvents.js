/**
 * Video call events — emitted by callService after a state change is saved.
 * The Socket.IO layer (src/sockets/callSocket.js) turns them into call:*
 * events for the two participants only. Also the integration point for
 * notifications (missed-call notices, push, …).
 *
 * Payloads contain call metadata only — never SDP or ICE data.
 *
 *   CALL_RINGING   { call, caller }   call placed; the receiver should ring
 *   CALL_BUSY      { call }           receiver was already in a call
 *   CALL_ACCEPTED  { call }
 *   CALL_CONNECTED { call }
 *   CALL_ENDED     { call }           any terminal state (rejected, missed, cancelled, ended, failed)
 */
const { EventEmitter } = require('events');
const logger = require('../utils/logger');

const CALL_EVENTS = Object.freeze({
  CALL_RINGING: 'call.ringing',
  CALL_BUSY: 'call.busy',
  CALL_ACCEPTED: 'call.accepted',
  CALL_CONNECTED: 'call.connected',
  CALL_ENDED: 'call.ended',
});

const callEvents = new EventEmitter();

function emitCallEvent(name, payload) {
  try {
    callEvents.emit(name, payload);
  } catch (err) {
    logger.error('Call event listener failed', { event: name, error: err.message });
  }
}

module.exports = { callEvents, emitCallEvent, CALL_EVENTS };
