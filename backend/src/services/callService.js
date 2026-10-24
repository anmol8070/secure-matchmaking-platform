/**
 * Phase 12 — private video calls (state, authorization, history, ICE servers).
 *
 * The server never sees audio/video: browsers connect peer-to-peer with
 * WebRTC (through TURN when a direct path fails). The server:
 *   - decides who may call (reuses Phase 10 canUsersCommunicate — accepted
 *     connection, no block either way, both accounts active),
 *   - owns the call session and its state machine (ids and states are
 *     generated and validated here, never trusted from the client),
 *   - relays signalling between the two participants (src/sockets/callSocket.js),
 *   - stores call metadata only (video_calls).
 *
 * States: ringing → accepted → connected → ended, with terminal rejected,
 * missed, cancelled, busy and failed. Every change is a conditional UPDATE,
 * so a rejected/ended call can never become active again and repeated
 * events (double clicks, reconnects, two devices) change nothing twice.
 */
const crypto = require('crypto');
const config = require('../config/environment');
const { getDb } = require('../config/database');
const { Profile, VideoCall } = require('../models');
const { STATUS, ACTIVE } = require('../models/videoCallModel');
const connectionService = require('./connectionService');
const privacyService = require('./privacyService');
const { createRateLimiter } = require('./messageRateLimiter');
const { CALL_EVENTS, emitCallEvent } = require('./callEvents');
const { Block } = require('../models');
const ApiError = require('../utils/ApiError');
const { withLockRetry } = require('../utils/dbErrors');
const HTTP = require('../constants/httpStatus');
const logger = require('../utils/logger');

const MESSAGES = Object.freeze({
  SELF: 'You cannot call yourself.',
  USER_NOT_FOUND: 'User not found.',
  NOT_CONNECTED: 'Video calls are available only between connected users.',
  NOT_ALLOWED: 'You cannot call this user.',
  CALL_NOT_FOUND: 'Call not found.',
  ALREADY_IN_CALL: 'You are already in a call.',
  ONLY_RECEIVER: 'Only the person being called can answer this call.',
  NOT_RINGING: 'This call is no longer ringing.',
  NOT_ACTIVE: 'This call is not active.',
  ENDED: 'This call has already ended.',
  RATE_LIMITED: 'Too many calls. Please wait a moment.',
});

const initiateLimiter = createRateLimiter({
  name: 'call-start',
  limit: () => config.calls.initiateRateLimit,
  windowMs: () => 60 * 1000,
});
const signalLimiter = createRateLimiter({
  name: 'call-signal',
  limit: () => config.calls.signalRateLimit,
  windowMs: () => 10 * 1000,
});

const sameId = (a, b) => Number(a) === Number(b);
const toIso = (value) => (value ? new Date(value).toISOString() : null);
const isParticipant = (call, userId) => call && (sameId(call.caller_id, userId) || sameId(call.receiver_id, userId));
const otherParticipant = (call, userId) => (sameId(call.caller_id, userId) ? call.receiver_id : call.caller_id);

/* ---------------- formatting ---------------- */

/** A call as seen by one participant (metadata only). */
function formatCall(row, viewerId, otherUser) {
  return {
    id: Number(row.call_id),
    callerId: Number(row.caller_id),
    receiverId: Number(row.receiver_id),
    direction: sameId(row.caller_id, viewerId) ? 'outgoing' : 'incoming',
    status: row.status,
    createdAt: toIso(row.created_at),
    answeredAt: toIso(row.answered_at),
    connectedAt: toIso(row.connected_at),
    endedAt: toIso(row.ended_at),
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    endReason: row.end_reason || null,
    ...(otherUser !== undefined && { otherUser }),
  };
}

/** `userId`'s card as `viewerId` may see it (privacy settings, Phase 13). */
async function publicCard(viewerId, userId) {
  return privacyService.cardFor(viewerId, userId, await Profile.findByPk(userId));
}

/** A call row in the neutral shape used by events (both participants receive it). */
function eventCall(row) {
  return {
    id: Number(row.call_id),
    callerId: Number(row.caller_id),
    receiverId: Number(row.receiver_id),
    status: row.status,
    createdAt: toIso(row.created_at),
    answeredAt: toIso(row.answered_at),
    connectedAt: toIso(row.connected_at),
    endedAt: toIso(row.ended_at),
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    endReason: row.end_reason || null,
  };
}

/* ---------------- timers (per process; the sweep covers restarts) ---------------- */

const timers = new Map(); // callId → { ring, connect }

function setTimer(callId, kind, ms, fn) {
  const entry = timers.get(callId) || {};
  clearTimeout(entry[kind]);
  entry[kind] = setTimeout(() => {
    fn().catch((err) => logger.error('Call timer failed', { callId, kind, error: err.name }));
  }, ms);
  entry[kind].unref?.();
  timers.set(callId, entry);
}

function clearTimers(callId, kind) {
  const entry = timers.get(callId);
  if (!entry) return;
  if (kind) {
    clearTimeout(entry[kind]);
    delete entry[kind];
  } else {
    clearTimeout(entry.ring);
    clearTimeout(entry.connect);
    timers.delete(callId);
  }
}

/* ---------------- authorization ---------------- */

/** Throws unless the two users may call each other right now. */
async function assertMayCall(userId, otherUserId) {
  if (await Block.isBlocked(userId, otherUserId)) throw ApiError.forbidden(MESSAGES.NOT_ALLOWED);
  if (!(await connectionService.canUsersCommunicate(userId, otherUserId))) throw ApiError.forbidden(MESSAGES.NOT_CONNECTED);
}

/** Loads a call the user takes part in; anyone else gets 404 (ids cannot be probed). */
async function findParticipantCall(userId, callId) {
  const row = await VideoCall.findByPk(callId);
  if (!isParticipant(row, userId)) throw ApiError.notFound(MESSAGES.CALL_NOT_FOUND);
  return row;
}

/* ---------------- state changes ---------------- */

/** Moves a call to a terminal state once; emits CALL_ENDED. Returns the row or null if it had already ended. */
async function finish(callId, from, to, { reason, endedBy = null } = {}) {
  const row = await VideoCall.findByPk(callId);
  if (!row || !from.includes(row.status)) return null;
  const now = new Date();
  const duration = row.connected_at ? Math.max(0, Math.round((now - new Date(row.connected_at)) / 1000)) : null;
  const changed = await VideoCall.transition(callId, from, to, {
    ended_at: now,
    end_reason: reason,
    ended_by: endedBy,
    duration_seconds: to === STATUS.ENDED || to === STATUS.FAILED ? duration : null,
  });
  if (!changed) return null;
  clearTimers(Number(callId));
  const updated = await VideoCall.findByPk(callId);
  logger.info('Call finished', { callId: Number(callId), status: to, reason });
  emitCallEvent(CALL_EVENTS.CALL_ENDED, { call: eventCall(updated) });
  return updated;
}

/**
 * Places a call. Both users' rows are locked (in id order) for the check,
 * so two simultaneous calls cannot both find the line free.
 * Returns { call, busy } — busy calls are recorded but never ring.
 */
async function initiateCall(callerId, receiverId) {
  if (sameId(callerId, receiverId)) throw ApiError.badRequest(MESSAGES.SELF);
  if (!(await Profile.getActiveProfileById(receiverId))) throw ApiError.notFound(MESSAGES.USER_NOT_FOUND);
  await assertMayCall(callerId, receiverId);
  if (!(await initiateLimiter.consume(callerId))) throw new ApiError(HTTP.TOO_MANY_REQUESTS, MESSAGES.RATE_LIMITED);

  const { row, busy } = await withLockRetry(() => getDb().transaction(async (trx) => {
    const ids = [Number(callerId), Number(receiverId)].sort((a, b) => a - b);
    await trx('users').whereIn('user_id', ids).orderBy('user_id').forUpdate().select('user_id');

    if (await VideoCall.findActiveFor([callerId], trx)) throw ApiError.conflict(MESSAGES.ALREADY_IN_CALL);
    if (await VideoCall.findActiveFor([receiverId], trx)) {
      return { row: await VideoCall.create({ callerId, receiverId, status: STATUS.BUSY, endReason: 'busy' }, trx), busy: true };
    }
    return { row: await VideoCall.create({ callerId, receiverId }, trx), busy: false };
  }));

  const call = eventCall(row);
  logger.info('Call placed', { callId: call.id, callerId: call.callerId, receiverId: call.receiverId, busy });
  if (busy) {
    emitCallEvent(CALL_EVENTS.CALL_BUSY, { call });
  } else {
    setTimer(call.id, 'ring', config.calls.ringTimeoutSeconds * 1000, () => missCall(call.id));
    emitCallEvent(CALL_EVENTS.CALL_RINGING, { call, caller: await publicCard(receiverId, callerId) });
  }
  return { call: formatCall(row, callerId, await publicCard(callerId, receiverId)), busy };
}

/** Receiver answers. Re-checks permission: a block since ringing ends the call. */
async function acceptCall(userId, callId) {
  const row = await findParticipantCall(userId, callId);
  if (!sameId(row.receiver_id, userId)) throw ApiError.forbidden(MESSAGES.ONLY_RECEIVER);
  if (row.status !== STATUS.RINGING) throw ApiError.conflict(MESSAGES.NOT_RINGING);
  try {
    await assertMayCall(userId, row.caller_id);
  } catch (err) {
    await finish(callId, ACTIVE, STATUS.FAILED, { reason: 'not_allowed' });
    throw err;
  }

  const changed = await VideoCall.transition(callId, [STATUS.RINGING], STATUS.ACCEPTED, { answered_at: new Date() });
  if (!changed) throw ApiError.conflict(MESSAGES.NOT_RINGING);
  clearTimers(Number(callId), 'ring');
  setTimer(Number(callId), 'connect', config.calls.connectTimeoutSeconds * 1000, () =>
    finish(callId, [STATUS.ACCEPTED], STATUS.FAILED, { reason: 'connect_timeout' })
  );

  const updated = await VideoCall.findByPk(callId);
  emitCallEvent(CALL_EVENTS.CALL_ACCEPTED, { call: eventCall(updated) });
  return formatCall(updated, userId, await publicCard(userId, updated.caller_id));
}

/** Receiver declines a ringing call. */
async function rejectCall(userId, callId) {
  const row = await findParticipantCall(userId, callId);
  if (!sameId(row.receiver_id, userId)) throw ApiError.forbidden(MESSAGES.ONLY_RECEIVER);
  const updated = await finish(callId, [STATUS.RINGING], STATUS.REJECTED, { reason: 'rejected', endedBy: userId });
  if (!updated) throw ApiError.conflict(MESSAGES.NOT_RINGING);
  return formatCall(updated, userId, await publicCard(userId, updated.caller_id));
}

/**
 * Either participant hangs up. Ringing → cancelled (caller) / rejected
 * (receiver); accepted or connected → ended, with the duration of the
 * connected part.
 */
async function endCall(userId, callId, reason = 'hangup') {
  const row = await findParticipantCall(userId, callId);
  let updated;
  if (row.status === STATUS.RINGING) {
    updated = sameId(row.caller_id, userId)
      ? await finish(callId, [STATUS.RINGING], STATUS.CANCELLED, { reason: 'cancelled', endedBy: userId })
      : await finish(callId, [STATUS.RINGING], STATUS.REJECTED, { reason: 'rejected', endedBy: userId });
  } else {
    updated = await finish(callId, [STATUS.ACCEPTED, STATUS.CONNECTED], STATUS.ENDED, { reason, endedBy: userId });
  }
  if (!updated) throw ApiError.conflict(MESSAGES.ENDED);
  return formatCall(updated, userId, await publicCard(userId, otherParticipant(updated, userId)));
}

/**
 * A participant's browser reports its RTCPeerConnection reached "connected".
 * Only then is the call "connected" (signalling success alone is not).
 * Repeated reports are harmless.
 */
async function markConnected(userId, callId) {
  const row = await findParticipantCall(userId, callId);
  if (row.status === STATUS.CONNECTED) return eventCall(row);
  if (row.status !== STATUS.ACCEPTED) throw ApiError.conflict(MESSAGES.NOT_ACTIVE);
  const changed = await VideoCall.transition(callId, [STATUS.ACCEPTED], STATUS.CONNECTED, { connected_at: new Date() });
  const updated = await VideoCall.findByPk(callId);
  if (changed) {
    clearTimers(Number(callId), 'connect');
    emitCallEvent(CALL_EVENTS.CALL_CONNECTED, { call: eventCall(updated) });
  }
  return eventCall(updated);
}

/** A participant reports that the media connection failed for good. */
async function reportFailure(userId, callId, reason = 'connection_failed') {
  await findParticipantCall(userId, callId);
  const updated = await finish(callId, ACTIVE, STATUS.FAILED, { reason, endedBy: userId });
  if (!updated) throw ApiError.conflict(MESSAGES.ENDED);
  return eventCall(updated);
}

/** Ring timeout: an unanswered call becomes missed — once. */
function missCall(callId) {
  return finish(callId, [STATUS.RINGING], STATUS.MISSED, { reason: 'no_answer' });
}

/** Ends whatever call is active between two users (block, removed connection). */
async function endCallsBetween(userA, userB, reason) {
  const row = await VideoCall.findActiveFor([userA]);
  if (row && isParticipant(row, userB)) await finish(row.call_id, ACTIVE, STATUS.ENDED, { reason });
}

/** Ends the user's active call (e.g. they went offline and did not come back). */
async function endActiveCallOf(userId, reason) {
  const row = await VideoCall.findActiveFor([userId]);
  if (!row) return null;
  const to = row.status === STATUS.RINGING ? (sameId(row.caller_id, userId) ? STATUS.CANCELLED : STATUS.MISSED) : STATUS.FAILED;
  return finish(row.call_id, ACTIVE, to, { reason });
}

/* ---------------- signalling authorization ---------------- */

const permissionCache = new Map(); // callId → checkedAt
const PERMISSION_RECHECK_MS = 5000;

/**
 * Checks one signalling message (offer/answer/ICE/rejoin) from `userId`:
 * participant of an accepted/connected call, the right role for the kind,
 * within the rate limit, and still allowed to communicate (re-checked at
 * most every 5 s per call; blocks/removals also end calls immediately).
 * Returns the call row.
 */
async function authorizeSignal(userId, callId, kind) {
  if (!(await signalLimiter.consume(userId))) throw new ApiError(HTTP.TOO_MANY_REQUESTS, 'Too many signalling messages.');
  const row = await findParticipantCall(userId, callId);
  if (![STATUS.ACCEPTED, STATUS.CONNECTED].includes(row.status)) throw ApiError.conflict(MESSAGES.NOT_ACTIVE);
  // The caller makes offers (also ICE restarts); the receiver answers.
  if (kind === 'offer' && !sameId(row.caller_id, userId)) throw ApiError.forbidden('Only the caller sends offers.');
  if (kind === 'answer' && !sameId(row.receiver_id, userId)) throw ApiError.forbidden('Only the receiver sends answers.');

  const checkedAt = permissionCache.get(Number(callId)) || 0;
  if (Date.now() - checkedAt > PERMISSION_RECHECK_MS) {
    if (!(await connectionService.canUsersCommunicate(row.caller_id, row.receiver_id))) {
      await finish(callId, ACTIVE, STATUS.FAILED, { reason: 'not_allowed' });
      throw ApiError.forbidden(MESSAGES.NOT_ALLOWED);
    }
    permissionCache.set(Number(callId), Date.now());
  }
  return row;
}

/* ---------------- reads ---------------- */

async function getCall(userId, callId) {
  const row = await findParticipantCall(userId, callId);
  return formatCall(row, userId, await publicCard(userId, otherParticipant(row, userId)));
}

/** The user's call history, newest first (only calls they took part in). */
async function getHistory(userId, { limit = 20, before } = {}) {
  const rows = await VideoCall.listForUser(userId, { limit: limit + 1, before });
  const page = rows.slice(0, limit);
  const cards = new Map();
  const calls = [];
  for (const row of page) {
    const otherId = Number(otherParticipant(row, userId));
    if (!cards.has(otherId)) cards.set(otherId, await publicCard(userId, otherId));
    calls.push(formatCall(row, userId, cards.get(otherId)));
  }
  return { calls, pagination: { limit, hasMore: rows.length > limit, nextCursor: rows.length > limit ? calls[calls.length - 1].id : null } };
}

/* ---------------- ICE servers ---------------- */

/**
 * ICE servers for the authenticated user. With WEBRTC_TURN_SECRET the TURN
 * credentials are minted per request ("TURN REST API": username =
 * <expiry>:<userId>, credential = base64(HMAC-SHA1(secret, username))), so
 * they expire and the secret never leaves the server. Never logged.
 */
function getIceServers(userId, now = Date.now()) {
  const { stunUrls, turnUrls, turnSecret, turnUsername, turnCredential, turnCredentialTtlSeconds } = config.webrtc;
  const iceServers = [];
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  let expiresAt = null;
  if (turnUrls.length && turnSecret) {
    const expiry = Math.floor(now / 1000) + turnCredentialTtlSeconds;
    const username = `${expiry}:${Number(userId)}`;
    const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
    iceServers.push({ urls: turnUrls, username, credential });
    expiresAt = new Date(expiry * 1000).toISOString();
  } else if (turnUrls.length && turnUsername && turnCredential) {
    iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
  }
  return { iceServers, expiresAt, relay: turnUrls.length > 0 };
}

/* ---------------- sweep (restarts, lost timers, other instances) ---------------- */

/** Closes calls whose timers were lost (server restart, another instance). */
async function sweepStaleCalls(now = Date.now()) {
  const graceMs = 5000;
  const ringCutoff = new Date(now - config.calls.ringTimeoutSeconds * 1000 - graceMs);
  const connectCutoff = new Date(now - config.calls.connectTimeoutSeconds * 1000 - graceMs);
  for (const row of await VideoCall.listStale(STATUS.RINGING, ringCutoff)) await missCall(row.call_id);
  for (const row of await VideoCall.listStale(STATUS.ACCEPTED, connectCutoff)) {
    await finish(row.call_id, [STATUS.ACCEPTED], STATUS.FAILED, { reason: 'connect_timeout' });
  }
}

function resetForTests() {
  for (const id of [...timers.keys()]) clearTimers(id);
  permissionCache.clear();
  initiateLimiter.reset();
  signalLimiter.reset();
}

module.exports = {
  initiateCall,
  acceptCall,
  rejectCall,
  endCall,
  markConnected,
  reportFailure,
  missCall,
  endCallsBetween,
  endActiveCallOf,
  authorizeSignal,
  getCall,
  getHistory,
  getIceServers,
  sweepStaleCalls,
  resetForTests,
  formatCall,
  STATUS,
  MESSAGES,
};
