/**
 * Phase 10 — connection requests and connection management.
 *
 * All connection business rules live here; controllers only translate HTTP.
 *
 * Lifecycle (one connection_requests row per pair of users, any direction):
 *
 *   (none) ──send──▶ pending ──accept (receiver)──▶ accepted ──remove (either)──▶ disconnected
 *                       │ ──reject (receiver)──▶ rejected
 *                       └─ ──cancel (sender)───▶ cancelled
 *
 *   rejected / cancelled / disconnected ──send──▶ pending   (the same row is re-opened,
 *   possibly in the other direction). Exception: the user whose request was
 *   rejected must wait REJECTED_REQUEST_COOLDOWN_DAYS before asking again;
 *   the user who rejected may send a request at any time.
 *
 * Any other transition is refused with 409. Ids from the client are never
 * trusted: the acting user always comes from the access token, and every
 * operation checks that the user is a member of the row (non-members get 404
 * so record ids cannot be probed).
 *
 * Interaction events (activity_feedback) are written in the same transaction
 * as the state change; notification hooks (connectionEvents) fire after commit.
 * Events are only stored — the ML model is not retrained here (Phase 9 owns that).
 */
const { getDb } = require('../config/database');
const { ActivityFeedback, Block, ConnectionRequest, Profile, User } = require('../models');
const { STATUS } = require('../models/connectionRequestModel');
const { CONNECTION_EVENTS, emitConnectionEvent } = require('./connectionEvents');
const { toPublicUrl } = require('./storage');
const { ageFromDateOfBirth } = require('../utils/age');
const { isUniqueViolation } = require('../utils/dbErrors');
const ApiError = require('../utils/ApiError');

const REJECTED_REQUEST_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** activity_feedback.action per connection event (names Phase 9 training already reads). */
const INTERACTION_ACTIONS = Object.freeze({
  SENT: 'connection_request',
  ACCEPTED: 'connection_accepted',
  REJECTED: 'rejection',
  CANCELLED: 'connection_cancelled',
  REMOVED: 'connection_removed',
});

/** Relationship state shown to the viewer (drives the connection button). */
const RELATIONSHIP_STATES = Object.freeze({
  NONE: 'none',
  PENDING_OUTGOING: 'pending_outgoing',
  PENDING_INCOMING: 'pending_incoming',
  CONNECTED: 'connected',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
});

const MESSAGES = Object.freeze({
  SELF_REQUEST: 'You cannot send a connection request to yourself.',
  USER_NOT_FOUND: 'User not found.',
  PROFILE_REQUIRED: 'Create your profile before sending connection requests.',
  NOT_PERMITTED: 'You cannot connect with this user.',
  ALREADY_PENDING: 'Connection request already pending.',
  INCOMING_PENDING: 'This user has already sent you a connection request. Accept or reject it from your received requests.',
  ALREADY_CONNECTED: 'Users are already connected.',
  REQUEST_EXISTS: 'A connection request between you and this user already exists.',
  REQUEST_NOT_FOUND: 'Connection request not found.',
  CONNECTION_NOT_FOUND: 'Connection not found.',
  NOT_PENDING: 'This connection request is no longer pending.',
  NOT_CONNECTED: 'Only an active connection can be removed.',
  ONLY_RECEIVER_ACCEPT: 'Only the recipient can accept this connection request.',
  ONLY_RECEIVER_REJECT: 'Only the recipient can reject this connection request.',
  ONLY_SENDER_CANCEL: 'Only the sender can cancel this connection request.',
  CANNOT_COMMUNICATE: 'You can only communicate with your accepted connections.',
});

/* ---------------- helpers ---------------- */

const sameId = (a, b) => Number(a) === Number(b);
const isMember = (row, userId) => sameId(row.sender_id, userId) || sameId(row.receiver_id, userId);
const otherMember = (row, userId) => (sameId(row.sender_id, userId) ? row.receiver_id : row.sender_id);
const toIso = (value) => (value ? new Date(value).toISOString() : null);

/** Earliest time the rejected sender may ask again, or null when there is no wait. */
function rerequestAllowedAt(row) {
  if (row.status !== STATUS.REJECTED) return null;
  const rejectedAt = new Date(row.responded_at || row.updated_at).getTime();
  return new Date(rejectedAt + REJECTED_REQUEST_COOLDOWN_DAYS * DAY_MS);
}

function rejectedSenderMustWait(row, senderId, now = new Date()) {
  if (row.status !== STATUS.REJECTED || !sameId(row.sender_id, senderId)) return false;
  return rerequestAllowedAt(row) > now;
}

/**
 * Public card for the other member. Only display fields — never email,
 * mobile, exact date of birth or account/security columns.
 */
function formatUser(profile, userId = profile?.user_id ?? profile?.other_user_id) {
  if (!profile) return null;
  return {
    userId: Number(userId),
    name: profile.name,
    profilePicture: toPublicUrl(profile.profile_photo_url),
    age: ageFromDateOfBirth(profile.date_of_birth),
    location: [profile.city, profile.state, profile.country].filter(Boolean).join(', ') || null,
  };
}

/** A connection row as seen by one of its members. */
function formatConnection(row, viewerId) {
  return {
    id: Number(row.request_id),
    status: row.status,
    direction: sameId(row.sender_id, viewerId) ? 'outgoing' : 'incoming',
    senderId: Number(row.sender_id),
    receiverId: Number(row.receiver_id),
    createdAt: toIso(row.created_at),
    respondedAt: toIso(row.responded_at),
    updatedAt: toIso(row.updated_at),
  };
}

function logInteraction(action, actorUserId, targetUserId, connectionRequestId, trx) {
  return ActivityFeedback.logFeedback({ userId: actorUserId, targetUserId, action, connectionRequestId }, trx);
}

/** Loads a row the user is a member of; anything else is "not found". */
async function findMemberRow(userId, requestId, trx, notFoundMessage) {
  const row = await ConnectionRequest.findById(requestId, trx);
  if (!row || !isMember(row, userId)) throw ApiError.notFound(notFoundMessage);
  return row;
}

/** Active account with a profile — the only users who can take part in connections. */
async function findEligibleProfile(userId, trx) {
  return Profile.getActiveProfileById(userId, trx);
}

/* ---------------- send ---------------- */

/**
 * Sends a connection request from the authenticated user to `receiverId`.
 * The sender id always comes from the session, never from the request body.
 */
async function createConnectionRequest(senderId, receiverId) {
  if (sameId(senderId, receiverId)) throw ApiError.badRequest(MESSAGES.SELF_REQUEST);

  let created;
  try {
    created = await getDb().transaction(async (trx) => {
      const receiver = await findEligibleProfile(receiverId, trx);
      if (!receiver) throw ApiError.notFound(MESSAGES.USER_NOT_FOUND);

      const sender = await findEligibleProfile(senderId, trx);
      if (!sender) throw ApiError.badRequest(MESSAGES.PROFILE_REQUIRED);

      if (await Block.isBlocked(senderId, receiverId, trx)) throw ApiError.forbidden(MESSAGES.NOT_PERMITTED);

      const existing = await ConnectionRequest.findBetween(senderId, receiverId, trx);
      let requestId;

      if (!existing) {
        requestId = await ConnectionRequest.create(senderId, receiverId, trx);
      } else {
        if (existing.status === STATUS.PENDING) {
          throw ApiError.conflict(sameId(existing.sender_id, senderId) ? MESSAGES.ALREADY_PENDING : MESSAGES.INCOMING_PENDING);
        }
        if (existing.status === STATUS.ACCEPTED) throw ApiError.conflict(MESSAGES.ALREADY_CONNECTED);
        if (rejectedSenderMustWait(existing, senderId)) {
          const date = rerequestAllowedAt(existing).toISOString().slice(0, 10);
          throw ApiError.conflict(`Your previous request was declined. You can send a new request after ${date}.`);
        }
        // rejected / cancelled / disconnected → a new request on the same row
        const reopened = await ConnectionRequest.reopen(existing.request_id, existing.status, senderId, receiverId, trx);
        if (!reopened) throw ApiError.conflict(MESSAGES.REQUEST_EXISTS);
        requestId = existing.request_id;
      }

      await logInteraction(INTERACTION_ACTIONS.SENT, senderId, receiverId, requestId, trx);
      return ConnectionRequest.findById(requestId, trx);
    });
  } catch (err) {
    // Two simultaneous requests for the same pair: the pair UNIQUE index lets only one insert win.
    if (isUniqueViolation(err)) throw ApiError.conflict(MESSAGES.REQUEST_EXISTS);
    throw err;
  }

  emitConnectionEvent(CONNECTION_EVENTS.REQUEST_SENT, {
    connectionId: Number(created.request_id),
    actorUserId: Number(senderId),
    targetUserId: Number(receiverId),
    status: created.status,
  });
  return formatConnection(created, senderId);
}

/* ---------------- respond / cancel / remove ---------------- */

/**
 * Shared state-change flow: load (membership) → role check → state check →
 * optional block check → atomic transition → interaction log → event.
 */
async function changeState(userId, requestId, rule) {
  const updated = await getDb().transaction(async (trx) => {
    const row = await findMemberRow(userId, requestId, trx, rule.notFoundMessage);

    if (rule.actor === 'receiver' && !sameId(row.receiver_id, userId)) throw ApiError.forbidden(rule.forbiddenMessage);
    if (rule.actor === 'sender' && !sameId(row.sender_id, userId)) throw ApiError.forbidden(rule.forbiddenMessage);
    if (row.status !== rule.from) throw ApiError.conflict(rule.wrongStateMessage);
    if (rule.checkBlock && (await Block.isBlocked(row.sender_id, row.receiver_id, trx))) {
      throw ApiError.forbidden(MESSAGES.NOT_PERMITTED);
    }

    // The status condition makes this atomic: a concurrent change makes it a no-op.
    const changed = await ConnectionRequest.transition(row.request_id, rule.from, rule.to, trx, { responded: rule.responded });
    if (!changed) throw ApiError.conflict(rule.wrongStateMessage);

    await logInteraction(rule.action, userId, otherMember(row, userId), row.request_id, trx);
    return ConnectionRequest.findById(row.request_id, trx);
  });

  emitConnectionEvent(rule.event, {
    connectionId: Number(updated.request_id),
    actorUserId: Number(userId),
    targetUserId: Number(otherMember(updated, userId)),
    status: updated.status,
  });
  return formatConnection(updated, userId);
}

const acceptConnectionRequest = (userId, requestId) =>
  changeState(userId, requestId, {
    actor: 'receiver',
    from: STATUS.PENDING,
    to: STATUS.ACCEPTED,
    responded: true,
    checkBlock: true,
    action: INTERACTION_ACTIONS.ACCEPTED,
    event: CONNECTION_EVENTS.REQUEST_ACCEPTED,
    notFoundMessage: MESSAGES.REQUEST_NOT_FOUND,
    forbiddenMessage: MESSAGES.ONLY_RECEIVER_ACCEPT,
    wrongStateMessage: MESSAGES.NOT_PENDING,
  });

// Rejecting, cancelling and removing are always allowed, even when one user has blocked the other.
const rejectConnectionRequest = (userId, requestId) =>
  changeState(userId, requestId, {
    actor: 'receiver',
    from: STATUS.PENDING,
    to: STATUS.REJECTED,
    responded: true,
    action: INTERACTION_ACTIONS.REJECTED,
    event: CONNECTION_EVENTS.REQUEST_REJECTED,
    notFoundMessage: MESSAGES.REQUEST_NOT_FOUND,
    forbiddenMessage: MESSAGES.ONLY_RECEIVER_REJECT,
    wrongStateMessage: MESSAGES.NOT_PENDING,
  });

const cancelConnectionRequest = (userId, requestId) =>
  changeState(userId, requestId, {
    actor: 'sender',
    from: STATUS.PENDING,
    to: STATUS.CANCELLED,
    action: INTERACTION_ACTIONS.CANCELLED,
    event: CONNECTION_EVENTS.REQUEST_CANCELLED,
    notFoundMessage: MESSAGES.REQUEST_NOT_FOUND,
    forbiddenMessage: MESSAGES.ONLY_SENDER_CANCEL,
    wrongStateMessage: MESSAGES.NOT_PENDING,
  });

const removeConnection = (userId, connectionId) =>
  changeState(userId, connectionId, {
    actor: 'either',
    from: STATUS.ACCEPTED,
    to: STATUS.DISCONNECTED,
    action: INTERACTION_ACTIONS.REMOVED,
    event: CONNECTION_EVENTS.CONNECTION_REMOVED,
    notFoundMessage: MESSAGES.CONNECTION_NOT_FOUND,
    wrongStateMessage: MESSAGES.NOT_CONNECTED,
  });

/** PUT /connections/:id { action } → the matching transition. */
const ACTIONS = Object.freeze({
  accept: acceptConnectionRequest,
  reject: rejectConnectionRequest,
  cancel: cancelConnectionRequest,
});

function updateConnectionRequest(userId, requestId, action) {
  const handler = ACTIONS[action];
  if (!handler) throw ApiError.badRequest('Unsupported action.');
  return handler(userId, requestId);
}

/* ---------------- read ---------------- */

/** Pending requests other users sent to `userId` (newest first). */
async function getReceivedRequests(userId) {
  const rows = await ConnectionRequest.listWithCounterpart(userId, 'received', [STATUS.PENDING]).orderBy(
    'connection_requests.created_at',
    'desc'
  );
  return rows.map((row) => ({
    id: Number(row.request_id),
    sender: formatUser(row, row.other_user_id),
    status: row.status,
    createdAt: toIso(row.created_at),
  }));
}

/**
 * Requests `userId` sent that are still pending or were declined (newest
 * first). Cancelled requests were withdrawn by the user and are not listed.
 */
async function getSentRequests(userId) {
  const rows = await ConnectionRequest.listWithCounterpart(userId, 'sent', [STATUS.PENDING, STATUS.REJECTED]).orderBy(
    'connection_requests.created_at',
    'desc'
  );
  return rows.map((row) => ({
    id: Number(row.request_id),
    receiver: formatUser(row, row.other_user_id),
    status: row.status,
    createdAt: toIso(row.created_at),
    respondedAt: toIso(row.responded_at),
  }));
}

/** Current (accepted) connections of `userId`, most recently connected first. */
async function getMyConnections(userId) {
  const rows = await ConnectionRequest.listWithCounterpart(userId, 'connected', [STATUS.ACCEPTED]).orderBy(
    'connection_requests.responded_at',
    'desc'
  );
  return rows.map((row) => ({
    connectionId: Number(row.request_id),
    user: formatUser(row, row.other_user_id),
    connectedAt: toIso(row.responded_at || row.updated_at),
  }));
}

/**
 * One request/connection, only for its members. A pair with a block in
 * either direction is reported as not found (restricted state is hidden).
 */
async function getConnectionById(userId, requestId) {
  const row = await findMemberRow(userId, requestId, undefined, MESSAGES.CONNECTION_NOT_FOUND);
  const otherId = otherMember(row, userId);
  if (await Block.isBlocked(userId, otherId)) throw ApiError.notFound(MESSAGES.CONNECTION_NOT_FOUND);

  const profile = await findEligibleProfile(otherId);
  return { ...formatConnection(row, userId), user: formatUser(profile, otherId) };
}

/**
 * Relationship between the authenticated user and another user, loaded from
 * the database so the UI never guesses the button state.
 */
async function getConnectionStatus(userId, otherUserId) {
  if (sameId(userId, otherUserId)) throw ApiError.badRequest('You cannot view a connection status with yourself.');

  const other = await findEligibleProfile(otherUserId);
  if (!other) throw ApiError.notFound(MESSAGES.USER_NOT_FOUND);

  const base = { userId: Number(otherUserId), connectionId: null, canSendRequest: false, canCommunicate: false };

  // Who blocked whom is never revealed.
  if (await Block.isBlocked(userId, otherUserId)) return { ...base, state: RELATIONSHIP_STATES.UNAVAILABLE };

  const row = await ConnectionRequest.findBetween(userId, otherUserId);
  if (!row) return { ...base, state: RELATIONSHIP_STATES.NONE, canSendRequest: true };

  const connectionId = Number(row.request_id);
  switch (row.status) {
    case STATUS.PENDING:
      return {
        ...base,
        connectionId,
        state: sameId(row.sender_id, userId) ? RELATIONSHIP_STATES.PENDING_OUTGOING : RELATIONSHIP_STATES.PENDING_INCOMING,
      };
    case STATUS.ACCEPTED:
      return { ...base, connectionId, state: RELATIONSHIP_STATES.CONNECTED, canCommunicate: true };
    case STATUS.REJECTED:
      if (sameId(row.sender_id, userId)) {
        const allowedAt = rerequestAllowedAt(row);
        return {
          ...base,
          connectionId,
          state: RELATIONSHIP_STATES.REJECTED,
          canSendRequest: allowedAt <= new Date(),
          canSendRequestAfter: allowedAt.toISOString(),
        };
      }
      return { ...base, state: RELATIONSHIP_STATES.NONE, canSendRequest: true };
    default: // cancelled, disconnected
      return { ...base, state: RELATIONSHIP_STATES.NONE, canSendRequest: true };
  }
}

/* ---------------- communication precondition (Phase 11 chat, Phase 12 video) ---------------- */

/**
 * True only when the two users have an ACCEPTED connection, neither has
 * blocked the other, and both accounts are active. pending / rejected /
 * cancelled / disconnected never allow private chat or video.
 */
async function canUsersCommunicate(userAId, userBId, trx) {
  if (!userAId || !userBId || sameId(userAId, userBId)) return false;

  const row = await ConnectionRequest.findBetween(userAId, userBId, trx);
  if (!row || row.status !== STATUS.ACCEPTED) return false;
  if (await Block.isBlocked(userAId, userBId, trx)) return false;

  const [a, b] = await Promise.all([User.findByPk(userAId, trx), User.findByPk(userBId, trx)]);
  return a?.status === 'active' && b?.status === 'active';
}

/** Throws 403 unless canUsersCommunicate — for chat/video endpoints and socket handshakes. */
async function assertCanCommunicate(userAId, userBId, trx) {
  if (!(await canUsersCommunicate(userAId, userBId, trx))) throw ApiError.forbidden(MESSAGES.CANNOT_COMMUNICATE);
}

module.exports = {
  createConnectionRequest,
  updateConnectionRequest,
  acceptConnectionRequest,
  rejectConnectionRequest,
  cancelConnectionRequest,
  removeConnection,
  getReceivedRequests,
  getSentRequests,
  getMyConnections,
  getConnectionById,
  getConnectionStatus,
  canUsersCommunicate,
  assertCanCommunicate,
  INTERACTION_ACTIONS,
  RELATIONSHIP_STATES,
  REJECTED_REQUEST_COOLDOWN_DAYS,
  MESSAGES,
};
