/**
 * video_calls — call metadata only (never media, SDP or ICE data).
 * State rules live in services/callService.js; every state change here is a
 * conditional UPDATE so a call can only move from the expected state.
 */
const BaseModel = require('./BaseModel');

const STATUS = Object.freeze({
  RINGING: 'ringing',
  ACCEPTED: 'accepted',
  CONNECTED: 'connected',
  REJECTED: 'rejected',
  MISSED: 'missed',
  CANCELLED: 'cancelled',
  BUSY: 'busy',
  ENDED: 'ended',
  FAILED: 'failed',
});

/** Calls that still hold the line (a user may be in at most one). */
const ACTIVE = Object.freeze([STATUS.RINGING, STATUS.ACCEPTED, STATUS.CONNECTED]);
const TERMINAL = Object.freeze([STATUS.REJECTED, STATUS.MISSED, STATUS.CANCELLED, STATUS.BUSY, STATUS.ENDED, STATUS.FAILED]);

class VideoCallModel extends BaseModel {
  constructor() {
    super({ table: 'video_calls', primaryKey: 'call_id' });
  }

  async create({ callerId, receiverId, status = STATUS.RINGING, endReason = null }, trx) {
    const now = new Date();
    const row = { caller_id: callerId, receiver_id: receiverId, status, created_at: now, updated_at: now };
    if (TERMINAL.includes(status)) Object.assign(row, { ended_at: now, end_reason: endReason });
    const id = await this.insertAndGetId(row, trx);
    return this.findByPk(id, trx);
  }

  /** The active call of either user, if any (locks nothing by itself). */
  findActiveFor(userIds, trx) {
    return this.query(trx)
      .whereIn('status', ACTIVE)
      .where((q) => q.whereIn('caller_id', userIds).orWhereIn('receiver_id', userIds))
      .orderBy('call_id', 'desc')
      .first();
  }

  /**
   * Moves the call from one of `from` to `to` with extra column changes.
   * Returns false when the call was no longer in an allowed state (another
   * event won the race, or the call already ended) — nothing is changed then.
   */
  async transition(callId, from, to, changes = {}, trx) {
    const updated = await this.query(trx)
      .where({ call_id: callId })
      .whereIn('status', from)
      .update({ status: to, updated_at: new Date(), ...changes });
    return updated === 1;
  }

  /** History of one user (either role), newest first; `before` is a call id cursor. */
  listForUser(userId, { limit, before } = {}, trx) {
    const q = this.query(trx).where((sub) => sub.where({ caller_id: userId }).orWhere({ receiver_id: userId }));
    if (before) q.andWhere('call_id', '<', before);
    return q.orderBy('call_id', 'desc').limit(limit);
  }

  /** Active calls older than a cut-off, for the sweep. */
  listStale(status, olderThan, trx) {
    const column = status === STATUS.RINGING ? 'created_at' : status === STATUS.ACCEPTED ? 'answered_at' : 'connected_at';
    return this.query(trx).where({ status }).andWhere(column, '<', olderThan).limit(200);
  }

  listActive(trx) {
    return this.query(trx).whereIn('status', [STATUS.ACCEPTED, STATUS.CONNECTED]).limit(500);
  }
}

module.exports = new VideoCallModel();
module.exports.STATUS = STATUS;
module.exports.ACTIVE = ACTIVE;
module.exports.TERMINAL = TERMINAL;
