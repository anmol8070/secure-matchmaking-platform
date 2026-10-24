/**
 * Phase 11 — private one-to-one messaging.
 *
 * All messaging rules live here; the REST controller and the Socket.IO
 * handlers are thin adapters that call these functions, so both paths
 * enforce exactly the same checks.
 *
 * Permission (reuses Phase 10, never re-implements it):
 *   send  — connectionService.canUsersCommunicate(): status ACCEPTED, no
 *           block in either direction, both accounts active.
 *   read  — allowed to send, OR the pair has existing history and no block
 *           (after a connection is removed the history stays readable,
 *           but no new messages can be sent).
 *
 * The database is the source of truth: a message is saved before any
 * real-time event is emitted (messageEvents → src/sockets). Message text is
 * never logged — only ids and statuses.
 *
 * Conversation id = the pair's connection_requests.request_id (one row per
 * pair, Phase 10), so no extra conversation tables are needed.
 */
const config = require('../config/environment');
const { Block, ConnectionRequest, Message, Profile } = require('../models');
const connectionService = require('./connectionService');
const privacyService = require('./privacyService');
const rateLimiter = require('./messageRateLimiter');
const chatImageService = require('./chatImageService');
const { MESSAGE_EVENTS, emitMessageEvent } = require('./messageEvents');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const logger = require('../utils/logger');

const MESSAGES = Object.freeze({
  SELF: 'You cannot message yourself.',
  USER_NOT_FOUND: 'User not found.',
  NOT_CONNECTED: 'Messaging is available only between connected users.',
  NOT_ALLOWED: 'You cannot message this user.',
  MESSAGE_NOT_FOUND: 'Message not found.',
  ONLY_RECEIVER_READ: 'Only the recipient can mark a message as read.',
  RATE_LIMITED: 'You are sending messages too quickly. Please wait a moment.',
});

const STATUS = Object.freeze({ SENT: 'sent', DELIVERED: 'delivered', READ: 'read' });

const sameId = (a, b) => Number(a) === Number(b);
const toIso = (value) => (value ? new Date(value).toISOString() : null);

function statusOf(row) {
  if (row.read_at) return STATUS.READ;
  if (row.delivered_at) return STATUS.DELIVERED;
  return STATUS.SENT;
}

/**
 * API shape of a message — only ever returned to its sender or receiver.
 * Image messages carry `image.path`: an API path (relative to /api/v1) that
 * serves the file to the two participants only; `message` is the caption.
 * The storage key is never exposed.
 */
function formatMessage(row, conversationId) {
  const id = Number(row.message_id);
  const type = row.message_type || 'text';
  return {
    id,
    conversationId: conversationId ? Number(conversationId) : null,
    senderId: Number(row.sender_id),
    receiverId: Number(row.receiver_id),
    type,
    message: row.message,
    image:
      type === 'image'
        ? {
            path: `/messages/${id}/image`,
            contentType: row.attachment_content_type,
            width: row.attachment_width === null || row.attachment_width === undefined ? null : Number(row.attachment_width),
            height: row.attachment_height === null || row.attachment_height === undefined ? null : Number(row.attachment_height),
            size: row.attachment_size === null || row.attachment_size === undefined ? null : Number(row.attachment_size),
          }
        : null,
    status: statusOf(row),
    createdAt: toIso(row.sent_at),
    deliveredAt: toIso(row.delivered_at),
    readAt: toIso(row.read_at),
  };
}

/**
 * What `userId` may do in the conversation with `otherUserId`.
 * Returns { conversationId, canRead, canSend, participant }.
 * Throws 400 for yourself and 404 when the other user is missing/inactive.
 */
async function getConversationAccess(userId, otherUserId, trx) {
  if (sameId(userId, otherUserId)) throw ApiError.badRequest(MESSAGES.SELF);

  const other = await Profile.getActiveProfileById(otherUserId, trx);
  if (!other) throw ApiError.notFound(MESSAGES.USER_NOT_FOUND);

  // Chat header card, filtered by the other user's privacy settings (Phase 13).
  const participant = await privacyService.cardFor(userId, otherUserId, other, { trx });
  const blocked = await Block.isBlocked(userId, otherUserId, trx);
  if (blocked) return { conversationId: null, canRead: false, canSend: false, participant, blocked: true };

  const relationship = await ConnectionRequest.findBetween(userId, otherUserId, trx);
  const conversationId = relationship ? Number(relationship.request_id) : null;
  const canSend = await connectionService.canUsersCommunicate(userId, otherUserId, trx);
  const canRead = canSend || (Boolean(relationship) && (await Message.existsBetween(userId, otherUserId, trx)));

  return { conversationId, canRead, canSend, participant, blocked: false };
}

/** True when `userId` may open the conversation with `otherUserId`. */
async function canAccessConversation(userId, otherUserId, trx) {
  try {
    return (await getConversationAccess(userId, otherUserId, trx)).canRead;
  } catch {
    return false;
  }
}

/**
 * Sends a text message from the authenticated user. `input` is already
 * validated by messageValidator.sendMessageBody (trimmed, bounded).
 */
async function sendMessage(senderId, { receiverId, message, type = 'text' }) {
  const access = await assertCanSend(senderId, receiverId);
  const row = await Message.create({ senderId, receiverId, message, messageType: type });
  return published(row, access);
}

/** Self, rate-limit and permission checks shared by every way of sending. */
async function assertCanSend(senderId, receiverId) {
  if (sameId(senderId, receiverId)) throw ApiError.badRequest(MESSAGES.SELF);
  if (!(await rateLimiter.consume(senderId))) throw new ApiError(HTTP.TOO_MANY_REQUESTS, MESSAGES.RATE_LIMITED);

  const access = await getConversationAccess(senderId, receiverId);
  if (access.blocked) throw ApiError.forbidden(MESSAGES.NOT_ALLOWED);
  if (!access.canSend) throw ApiError.forbidden(MESSAGES.NOT_CONNECTED);
  return access;
}

/** Formats a saved message, logs its ids and emits MESSAGE_CREATED. */
function published(row, access) {
  const formatted = formatMessage(row, access.conversationId);
  // Ids only — never the text (the logger also redacts keys containing 'message').
  logger.info('Chat entry stored', {
    id: formatted.id,
    type: formatted.type,
    senderId: formatted.senderId,
    receiverId: formatted.receiverId,
    conversationId: formatted.conversationId,
  });
  emitMessageEvent(MESSAGE_EVENTS.MESSAGE_CREATED, { message: formatted, conversationId: access.conversationId });
  return formatted;
}

/**
 * Sends an image (optionally with a caption). Permission is checked BEFORE
 * the upload is processed, the image is re-encoded and stored privately,
 * and the file is removed again if the message row cannot be saved.
 */
async function sendImageMessage(senderId, { receiverId, caption = '' }, file) {
  const access = await assertCanSend(senderId, receiverId);
  const processed = await chatImageService.processImage(file);
  const key = await chatImageService.store(processed);
  let row;
  try {
    row = await Message.create({
      senderId,
      receiverId,
      message: caption,
      messageType: 'image',
      attachment: { key, contentType: processed.contentType, width: processed.width, height: processed.height, size: processed.size },
    });
  } catch (err) {
    await chatImageService.remove(key);
    throw err;
  }
  return published(row, access);
}

/**
 * The image file of an image message, for its sender or receiver only.
 * Others get 404 (existence is not revealed); a blocked pair gets 403.
 */
async function getMessageImage(userId, messageId) {
  const row = await Message.findById(messageId);
  const isParty = row && (sameId(row.sender_id, userId) || sameId(row.receiver_id, userId));
  if (!isParty || row.message_type !== 'image' || !row.attachment_key) throw ApiError.notFound(MESSAGES.MESSAGE_NOT_FOUND);

  const otherId = sameId(row.sender_id, userId) ? row.receiver_id : row.sender_id;
  const access = await getConversationAccess(userId, otherId);
  if (!access.canRead) throw ApiError.forbidden(access.blocked ? MESSAGES.NOT_ALLOWED : MESSAGES.NOT_CONNECTED);

  const buffer = await chatImageService.read(row.attachment_key);
  if (!buffer) throw ApiError.notFound(MESSAGES.MESSAGE_NOT_FOUND);
  return { buffer, contentType: row.attachment_content_type || 'image/webp' };
}

/**
 * Records that messages from `senderId` reached one of `receiverId`'s
 * devices (all undelivered ones, or up to `upToId`). Emits MESSAGES_DELIVERED.
 */
async function markMessagesDelivered(receiverId, senderId, { upToId, conversationId } = {}) {
  const messageIds = await Message.markDelivered(receiverId, senderId, { upToId });
  if (messageIds.length) {
    emitMessageEvent(MESSAGE_EVENTS.MESSAGES_DELIVERED, {
      conversationId: conversationId ?? null,
      senderId: Number(senderId),
      receiverId: Number(receiverId),
      messageIds,
      deliveredAt: new Date().toISOString(),
    });
  }
  return messageIds;
}

/** Spec name: delivery of one message to its receiver. */
async function markMessageDelivered(receiverId, messageId) {
  const row = await Message.findById(messageId);
  if (!row || !sameId(row.receiver_id, receiverId)) return [];
  return markMessagesDelivered(receiverId, row.sender_id, { upToId: row.message_id });
}

/**
 * One page of the conversation between `userId` and `otherUserId`, oldest
 * → newest within the page. Pass `pagination.nextCursor` as `before` to load
 * older messages. Loading the history marks incoming messages delivered.
 */
async function getConversationMessages(userId, otherUserId, { limit = config.messages.defaultLimit, before } = {}) {
  const access = await getConversationAccess(userId, otherUserId);
  if (access.blocked) throw ApiError.forbidden(MESSAGES.NOT_ALLOWED);
  if (!access.canRead) throw ApiError.forbidden(MESSAGES.NOT_CONNECTED);

  const rows = await Message.listConversation(userId, otherUserId, { limit: limit + 1, before });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();

  // Opening the conversation = the messages reached this user.
  const delivered = await markMessagesDelivered(userId, otherUserId, { conversationId: access.conversationId });
  const deliveredSet = new Set(delivered);
  const now = new Date();
  for (const row of page) if (deliveredSet.has(Number(row.message_id))) row.delivered_at = now;

  return {
    conversationId: access.conversationId,
    participant: access.participant,
    canSend: access.canSend,
    messages: page.map((row) => formatMessage(row, access.conversationId)),
    pagination: { limit, hasMore, nextCursor: hasMore && page.length ? Number(page[0].message_id) : null },
  };
}

/**
 * Marks `messageId` and every earlier unread message from the same sender
 * as read. Only the receiver may do this, and only while they may still
 * open the conversation.
 */
async function markMessageRead(userId, messageId) {
  const row = await Message.findById(messageId);
  const isParty = row && (sameId(row.sender_id, userId) || sameId(row.receiver_id, userId));
  if (!isParty) throw ApiError.notFound(MESSAGES.MESSAGE_NOT_FOUND);
  if (!sameId(row.receiver_id, userId)) throw ApiError.forbidden(MESSAGES.ONLY_RECEIVER_READ);

  const access = await getConversationAccess(userId, row.sender_id);
  if (!access.canRead) throw ApiError.forbidden(access.blocked ? MESSAGES.NOT_ALLOWED : MESSAGES.NOT_CONNECTED);

  const { ids, readAt } = await Message.markReadUpTo(userId, row.sender_id, row.message_id);
  const result = {
    conversationId: access.conversationId,
    senderId: Number(row.sender_id),
    readerId: Number(userId),
    messageIds: ids,
    readAt: readAt.toISOString(),
  };
  if (ids.length) emitMessageEvent(MESSAGE_EVENTS.MESSAGES_READ, result);
  return result;
}

/**
 * The user's conversations (latest message, unread count), newest first.
 * Partners who are blocked (either way) or no longer active are left out.
 */
async function listConversations(userId) {
  const summaries = await Message.listConversationSummaries(userId);
  const conversations = [];
  for (const summary of summaries) {
    let access;
    try {
      access = await getConversationAccess(userId, summary.partnerId);
    } catch {
      continue; // partner inactive / removed
    }
    if (!access.canRead) continue;
    conversations.push({
      conversationId: access.conversationId,
      participant: access.participant,
      canSend: access.canSend,
      lastMessage: formatMessage(summary.lastMessage, access.conversationId),
      unreadCount: summary.unreadCount,
    });
  }
  return conversations;
}

module.exports = {
  sendMessage,
  sendImageMessage,
  getMessageImage,
  getConversationMessages,
  listConversations,
  markMessageDelivered,
  markMessagesDelivered,
  markMessageRead,
  canAccessConversation,
  getConversationAccess,
  formatMessage,
  STATUS,
  MESSAGES,
};
