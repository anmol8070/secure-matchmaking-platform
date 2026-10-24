/**
 * Video call signalling over the existing Socket.IO server (Phase 12).
 *
 * Rooms:
 *   user:<id>  — every device of a user: incoming-call rings and state updates
 *   call:<id>  — ONLY the two devices taking part in the call (the caller's
 *                device that placed it and the receiver's device that
 *                accepted it). SDP offers/answers and ICE candidates are
 *                relayed inside this room only, never to user rooms, never
 *                broadcast, and a client can never name a socket id or room.
 *
 * Every signalling event: authenticated socket → callService.authorizeSignal
 * (participant, call accepted/connected, role, rate limit, permission
 * re-check) → payload validation → relay to the other participant's device.
 * SDP and ICE data are never logged or stored.
 */
const config = require('../config/environment');
const callService = require('../services/callService');
const { callEvents, CALL_EVENTS } = require('../services/callEvents');
const { blockEvents, BLOCK_EVENTS } = require('../services/blockService');
const { connectionEvents, CONNECTION_EVENTS } = require('../services/connectionEvents');
const { VideoCall } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const presence = require('./presence');
const privacyService = require('../services/privacyService');
const { rooms } = require('./realtime');
const {
  callTarget,
  userTarget,
  offerPayload,
  answerPayload,
  icePayload,
  endPayload,
  failPayload,
} = require('../validators/callValidator');

const callRoom = (callId) => `call:${Number(callId)}`;

const CALL_EVENTS_IN = Object.freeze({
  INITIATE: 'call:initiate',
  ACCEPT: 'call:accept',
  REJECT: 'call:reject',
  JOIN: 'call:join',
  OFFER: 'call:offer',
  ANSWER: 'call:answer',
  ICE: 'call:ice-candidate',
  CONNECTED: 'call:connected',
  FAILED: 'call:failed',
  END: 'call:end',
});

const CALL_EVENTS_OUT = Object.freeze({
  INCOMING: 'call:incoming',
  BUSY: 'call:busy',
  ACCEPTED: 'call:accepted',
  CONNECTED: 'call:connected',
  ENDED: 'call:ended',
  OFFER: 'call:offer',
  ANSWER: 'call:answer',
  ICE: 'call:ice-candidate',
  PEER_LEFT: 'call:peer-left',
  PEER_REJOINED: 'call:peer-rejoined',
});

/** Is any socket of `userId` in the call room (all instances)? */
async function userInCallRoom(io, callId, userId) {
  const sockets = await io.in(callRoom(callId)).fetchSockets();
  return sockets.some((s) => Number(s.data.userId) === Number(userId));
}

/* ---------------- away-from-call grace (refresh, network drop) ---------------- */

const awayTimers = new Map(); // `${callId}:${userId}` → timeout

function cancelAway(callId, userId) {
  const key = `${callId}:${userId}`;
  clearTimeout(awayTimers.get(key));
  awayTimers.delete(key);
}

function startAway(io, callId, userId) {
  const key = `${callId}:${userId}`;
  if (awayTimers.has(key)) return;
  const timer = setTimeout(async () => {
    awayTimers.delete(key);
    try {
      if (await userInCallRoom(io, callId, userId)) return; // came back
      const row = await VideoCall.findByPk(callId);
      if (!row || !['ringing', 'accepted', 'connected'].includes(row.status)) return;
      await callService.endActiveCallOf(userId, 'participant_left');
    } catch (err) {
      logger.error('Ending abandoned call failed', { callId, error: err.name });
    }
  }, config.calls.rejoinGraceSeconds * 1000);
  timer.unref?.();
  awayTimers.set(key, timer);
}

/* ---------------- per-socket handlers ---------------- */

function registerCallHandlers(io, socket, { handle, parse }) {
  const me = socket.data.userId;
  socket.data.calls = new Set(); // call ids this socket is bound to

  const bind = async (callId) => {
    await socket.join(callRoom(callId));
    socket.data.calls.add(Number(callId));
    cancelAway(Number(callId), me);
  };

  /** The socket must be the device bound to the call (not just any tab of the user). */
  const assertBound = (callId) => {
    if (!socket.rooms.has(callRoom(callId))) throw ApiError.forbidden('Join the call from this device first.');
  };

  handle(socket, CALL_EVENTS_IN.INITIATE, async (payload) => {
    const { userId } = parse(userTarget, payload);
    const { call, busy } = await callService.initiateCall(me, userId);
    if (!busy) await bind(call.id);
    // Whether the receiver is online is shown only if their privacy settings allow it.
    const receiverOnline = (await privacyService.canViewOnlineStatus(me, userId)) ? await presence.isOnline(io, userId) : null;
    return { call, busy, receiverOnline };
  });

  handle(socket, CALL_EVENTS_IN.ACCEPT, async (payload) => {
    const { callId } = parse(callTarget, payload);
    const call = await callService.acceptCall(me, callId);
    await bind(callId);
    return { call };
  });

  handle(socket, CALL_EVENTS_IN.REJECT, async (payload) => {
    const { callId } = parse(callTarget, payload);
    return { call: await callService.rejectCall(me, callId) };
  });

  // Re-binds a device after a refresh/reconnect (or after accepting via REST).
  handle(socket, CALL_EVENTS_IN.JOIN, async (payload) => {
    const { callId } = parse(callTarget, payload);
    const call = await callService.getCall(me, callId);
    const ringingCaller = call.status === 'ringing' && call.direction === 'outgoing';
    if (!ringingCaller) await callService.authorizeSignal(me, callId, 'join');
    await bind(callId);
    socket.to(callRoom(callId)).emit(CALL_EVENTS_OUT.PEER_REJOINED, { callId: Number(callId), userId: me });
    return { call };
  });

  const relay = (event, schema, kind, outEvent) =>
    handle(socket, event, async (payload) => {
      const data = parse(schema, payload);
      await callService.authorizeSignal(me, data.callId, kind);
      assertBound(data.callId);
      const { callId, ...signal } = data;
      socket.to(callRoom(callId)).emit(outEvent, { callId: Number(callId), fromUserId: me, ...signal });
      return {};
    });

  relay(CALL_EVENTS_IN.OFFER, offerPayload, 'offer', CALL_EVENTS_OUT.OFFER);
  relay(CALL_EVENTS_IN.ANSWER, answerPayload, 'answer', CALL_EVENTS_OUT.ANSWER);
  relay(CALL_EVENTS_IN.ICE, icePayload, 'ice', CALL_EVENTS_OUT.ICE);

  handle(socket, CALL_EVENTS_IN.CONNECTED, async (payload) => {
    const { callId } = parse(callTarget, payload);
    assertBound(callId);
    return { call: await callService.markConnected(me, callId) };
  });

  handle(socket, CALL_EVENTS_IN.FAILED, async (payload) => {
    const { callId, reason } = parse(failPayload, payload);
    return { call: await callService.reportFailure(me, callId, reason) };
  });

  handle(socket, CALL_EVENTS_IN.END, async (payload) => {
    const { callId, reason } = parse(endPayload, payload);
    return { call: await callService.endCall(me, callId, reason) };
  });

  // A bound device went away: tell the other side, and end the call if the
  // user does not come back (on any device) within the grace period.
  socket.on('disconnect', () => {
    for (const callId of socket.data.calls) {
      io.to(callRoom(callId)).emit(CALL_EVENTS_OUT.PEER_LEFT, { callId, userId: me });
      startAway(io, callId, me);
    }
  });
}

/* ---------------- service events → participants ---------------- */

function bridgeCallEvents(io) {
  const toBoth = (call) => io.to(rooms.user(call.callerId)).to(rooms.user(call.receiverId));

  const onRinging = ({ call, caller }) => io.to(rooms.user(call.receiverId)).emit(CALL_EVENTS_OUT.INCOMING, { call, caller });
  const onBusy = ({ call }) => io.to(rooms.user(call.callerId)).emit(CALL_EVENTS_OUT.BUSY, { call });
  // Both users' devices learn the state: the receiver's other devices stop ringing.
  const onAccepted = ({ call }) => toBoth(call).emit(CALL_EVENTS_OUT.ACCEPTED, { call });
  const onConnected = ({ call }) => toBoth(call).emit(CALL_EVENTS_OUT.CONNECTED, { call });
  const onEnded = ({ call }) => {
    toBoth(call).emit(CALL_EVENTS_OUT.ENDED, { call });
    io.in(callRoom(call.id)).socketsLeave(callRoom(call.id));
    cancelAway(call.id, call.callerId);
    cancelAway(call.id, call.receiverId);
  };

  // A block or a removed connection ends their call immediately.
  const onBlocked = ({ blockerId, blockedId }) =>
    callService.endCallsBetween(blockerId, blockedId, 'unavailable').catch((e) => logger.error('Ending call after block failed', { error: e.name }));
  const onRemoved = ({ actorUserId, targetUserId }) =>
    callService.endCallsBetween(actorUserId, targetUserId, 'disconnected').catch((e) => logger.error('Ending call after removal failed', { error: e.name }));

  callEvents.on(CALL_EVENTS.CALL_RINGING, onRinging);
  callEvents.on(CALL_EVENTS.CALL_BUSY, onBusy);
  callEvents.on(CALL_EVENTS.CALL_ACCEPTED, onAccepted);
  callEvents.on(CALL_EVENTS.CALL_CONNECTED, onConnected);
  callEvents.on(CALL_EVENTS.CALL_ENDED, onEnded);
  blockEvents.on(BLOCK_EVENTS.BLOCKED, onBlocked);
  connectionEvents.on(CONNECTION_EVENTS.CONNECTION_REMOVED, onRemoved);

  return () => {
    callEvents.off(CALL_EVENTS.CALL_RINGING, onRinging);
    callEvents.off(CALL_EVENTS.CALL_BUSY, onBusy);
    callEvents.off(CALL_EVENTS.CALL_ACCEPTED, onAccepted);
    callEvents.off(CALL_EVENTS.CALL_CONNECTED, onConnected);
    callEvents.off(CALL_EVENTS.CALL_ENDED, onEnded);
    blockEvents.off(BLOCK_EVENTS.BLOCKED, onBlocked);
    connectionEvents.off(CONNECTION_EVENTS.CONNECTION_REMOVED, onRemoved);
    for (const timer of awayTimers.values()) clearTimeout(timer);
    awayTimers.clear();
  };
}

/* ---------------- sweep ---------------- */

/**
 * Every 15 s: close calls whose timers were lost (restart, other instance),
 * and calls whose participant has had no device in the call room for longer
 * than the rejoin grace period.
 */
function startCallSweep(io, intervalMs = 15000) {
  const missingSince = new Map(); // `${callId}:${userId}` → first time seen missing
  const tick = async () => {
    try {
      await callService.sweepStaleCalls();
      const now = Date.now();
      const seen = new Set();
      for (const row of await VideoCall.listActive()) {
        for (const userId of [row.caller_id, row.receiver_id]) {
          const key = `${row.call_id}:${userId}`;
          seen.add(key);
          if (await userInCallRoom(io, row.call_id, userId)) {
            missingSince.delete(key);
          } else if (!missingSince.has(key)) {
            missingSince.set(key, now);
          } else if (now - missingSince.get(key) > config.calls.rejoinGraceSeconds * 1000) {
            missingSince.delete(key);
            await callService.endActiveCallOf(userId, 'participant_left');
          }
        }
      }
      for (const key of missingSince.keys()) if (!seen.has(key)) missingSince.delete(key);
    } catch (err) {
      logger.error('Call sweep failed', { error: err.name });
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer), tick };
}

module.exports = {
  registerCallHandlers,
  bridgeCallEvents,
  startCallSweep,
  CALL_EVENTS_IN,
  CALL_EVENTS_OUT,
  callRoom,
};
