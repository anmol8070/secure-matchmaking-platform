/**
 * messages — private one-to-one messages. Never log message text.
 * Business rules (who may read/send) live in services/messageService.js.
 */
const BaseModel = require('./BaseModel');
const { getDb } = require('../config/database');

const COLUMNS = [
  'message_id',
  'sender_id',
  'receiver_id',
  'message',
  'message_type',
  'sent_at',
  'delivered_at',
  'read_at',
  'attachment_key',
  'attachment_content_type',
  'attachment_width',
  'attachment_height',
  'attachment_size',
];

/** WHERE clause for the conversation between two users (either direction). */
function pair(query, userA, userB) {
  return query.where((q) => {
    q.where({ sender_id: userA, receiver_id: userB }).orWhere({ sender_id: userB, receiver_id: userA });
  });
}

class MessageModel extends BaseModel {
  constructor() {
    super({ table: 'messages', primaryKey: 'message_id' });
  }

  /** attachment: { key, contentType, width, height, size } for image messages. */
  async create({ senderId, receiverId, message, messageType = 'text', attachment = null }, trx) {
    const row = { sender_id: senderId, receiver_id: receiverId, message, message_type: messageType, sent_at: new Date() };
    if (attachment) {
      Object.assign(row, {
        attachment_key: attachment.key,
        attachment_content_type: attachment.contentType,
        attachment_width: attachment.width,
        attachment_height: attachment.height,
        attachment_size: attachment.size,
      });
    }
    const id = await this.insertAndGetId(row, trx);
    return this.findById(id, trx);
  }

  findById(messageId, trx) {
    return this.query(trx).select(COLUMNS).where({ message_id: messageId }).first();
  }

  /**
   * One page of a conversation, newest first. `before` is a message id
   * cursor: only messages older than it are returned. Ordering by the
   * unique message_id makes pages deterministic (no duplicates or gaps).
   */
  listConversation(userA, userB, { limit, before } = {}, trx) {
    const q = pair(this.query(trx).select(COLUMNS), userA, userB);
    if (before) q.andWhere('message_id', '<', before);
    return q.orderBy('message_id', 'desc').limit(limit);
  }

  /** True when the two users have exchanged at least one message. */
  async existsBetween(userA, userB, trx) {
    return Boolean(await pair(this.query(trx).select('message_id'), userA, userB).first());
  }

  /** Marks messages from `senderId` to `receiverId` delivered; returns the affected ids. */
  async markDelivered(receiverId, senderId, { upToId } = {}, trx) {
    const q = this.query(trx).where({ receiver_id: receiverId, sender_id: senderId }).whereNull('delivered_at');
    if (upToId) q.andWhere('message_id', '<=', upToId);
    const ids = (await q.clone().select('message_id')).map((r) => Number(r.message_id));
    if (ids.length) await this.query(trx).whereIn('message_id', ids).update({ delivered_at: new Date() });
    return ids;
  }

  /**
   * Marks every unread message from `senderId` to `receiverId` up to and
   * including `upToId` as read (reading a message implies having seen the
   * earlier ones). Undelivered ones become delivered at the same time.
   */
  async markReadUpTo(receiverId, senderId, upToId, trx) {
    const now = new Date();
    const base = () =>
      this.query(trx).where({ receiver_id: receiverId, sender_id: senderId }).whereNull('read_at').andWhere('message_id', '<=', upToId);
    const ids = (await base().select('message_id')).map((r) => Number(r.message_id));
    if (ids.length) {
      await this.query(trx).whereIn('message_id', ids).whereNull('delivered_at').update({ delivered_at: now });
      await this.query(trx).whereIn('message_id', ids).update({ read_at: now });
    }
    return { ids, readAt: now };
  }

  /**
   * The user's conversations: the latest message with each partner and the
   * number of unread messages from that partner, newest conversation first.
   */
  async listConversationSummaries(userId, trx) {
    const db = trx || getDb();
    const latest = await this.query(trx)
      .select(
        db.raw('CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS partner_id', [userId]),
        db.raw('MAX(message_id) AS last_message_id')
      )
      .where((q) => q.where({ sender_id: userId }).orWhere({ receiver_id: userId }))
      .groupByRaw('CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END', [userId]);

    if (!latest.length) return [];
    const lastIds = latest.map((r) => r.last_message_id);
    const [lastMessages, unread] = await Promise.all([
      this.query(trx).select(COLUMNS).whereIn('message_id', lastIds),
      this.query(trx)
        .select('sender_id')
        .count({ n: '*' })
        .where({ receiver_id: userId })
        .whereNull('read_at')
        .groupBy('sender_id'),
    ]);
    const unreadBy = new Map(unread.map((r) => [Number(r.sender_id), Number(r.n)]));
    const byId = new Map(lastMessages.map((m) => [Number(m.message_id), m]));

    return latest
      .map((r) => ({
        partnerId: Number(r.partner_id),
        lastMessage: byId.get(Number(r.last_message_id)),
        unreadCount: unreadBy.get(Number(r.partner_id)) || 0,
      }))
      .sort((a, b) => Number(b.lastMessage.message_id) - Number(a.lastMessage.message_id));
  }
}

module.exports = new MessageModel();
