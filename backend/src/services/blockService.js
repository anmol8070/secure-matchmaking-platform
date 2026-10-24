/**
 * Blocking users.
 *
 * A block works in both directions everywhere it is checked
 * (Block.isBlocked): profiles, recommendations, connection requests, chat
 * and video calls. Blocking also ENDS the relationship (Phase 13):
 * an accepted connection becomes "disconnected" and a pending request
 * "cancelled". Unblocking removes the block only — nothing is restored;
 * the users must connect again. Message history is kept (not deleted); it
 * is hidden while blocked and afterwards follows the normal rules (a
 * disconnected pair may read, not send).
 *
 * blockEvents lets real-time layers react immediately: the chat socket
 * closes the pair's conversation room and an active call between them is
 * ended (reason "unavailable").
 */
const { EventEmitter } = require('events');
const { Block, Profile, User } = require('../models');
const connectionService = require('./connectionService');
const privacyService = require('./privacyService');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const BLOCK_EVENTS = Object.freeze({ BLOCKED: 'block.created', UNBLOCKED: 'block.removed' });
const blockEvents = new EventEmitter();

function emit(name, payload) {
  try {
    blockEvents.emit(name, payload);
  } catch (err) {
    logger.error('Block event listener failed', { event: name, error: err.message });
  }
}

const toIso = (value) => (value ? new Date(value).toISOString() : null);

/** Users the authenticated user has blocked (public card only), newest first. */
async function listBlocks(userId) {
  const rows = (await Block.listBlockedUsers(userId)).sort((a, b) => Number(b.block_id) - Number(a.block_id));
  const profiles = await Profile.query().whereIn('user_id', rows.map((r) => r.blocked_id));
  const byId = new Map(profiles.map((p) => [Number(p.user_id), p]));
  // The blocker sees only what any member may see (their public fields), never more.
  const cards = await privacyService.cardsFor(
    userId,
    rows.map((r) => ({ userId: r.blocked_id, profile: byId.get(Number(r.blocked_id)) })),
    { asRelationship: privacyService.RELATIONSHIP.MEMBER }
  );
  return rows.map((row) => ({
    userId: Number(row.blocked_id),
    user: cards.get(Number(row.blocked_id)) || null,
    blockedAt: toIso(row.created_at),
    reason: row.reason || null,
  }));
}

/** Blocks `targetUserId`. Idempotent: blocking twice keeps one block. */
async function blockUser(userId, targetUserId, reason = null) {
  if (Number(userId) === Number(targetUserId)) throw ApiError.badRequest('You cannot block yourself.');
  // Any existing account can be blocked (also suspended ones), except deleted ones.
  const target = await User.findByPk(targetUserId);
  if (!target || target.status === 'deleted') throw ApiError.notFound('User not found.');

  const alreadyBlocked = await Block.query().where({ blocker_id: userId, blocked_id: targetUserId }).first();
  if (!alreadyBlocked) {
    // The block is saved first, so every later request is refused even if
    // ending the relationship below were to fail.
    await Block.blockUser(userId, targetUserId, reason);
    const ended = await connectionService.severForBlock(userId, targetUserId);
    emit(BLOCK_EVENTS.BLOCKED, { blockerId: Number(userId), blockedId: Number(targetUserId), endedConnection: ended });
  }
  return { userId: Number(targetUserId), blocked: true, created: !alreadyBlocked };
}

/** Removes the authenticated user's block on `targetUserId` (404 if none). */
async function unblockUser(userId, targetUserId) {
  const removed = await Block.unblockUser(userId, targetUserId);
  if (!removed) throw ApiError.notFound('You have not blocked this user.');
  emit(BLOCK_EVENTS.UNBLOCKED, { blockerId: Number(userId), blockedId: Number(targetUserId) });
  return { userId: Number(targetUserId), blocked: false };
}

module.exports = { listBlocks, blockUser, unblockUser, blockEvents, BLOCK_EVENTS };
