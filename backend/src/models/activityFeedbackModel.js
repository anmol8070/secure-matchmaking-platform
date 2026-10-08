const BaseModel = require('./BaseModel');

class ActivityFeedbackModel extends BaseModel {
  constructor() {
    super({ table: 'activity_feedback', primaryKey: 'id' });
  }

  async logFeedback({ userId, targetUserId = null, action, reason = null, connectionRequestId = null }, trx) {
    const row = {
      user_id: userId,
      target_user_id: targetUserId,
      action,
      reason,
      created_at: new Date(),
    };
    // Only set when given, so callers that predate the column keep their exact inserts.
    if (connectionRequestId) row.connection_request_id = connectionRequestId;
    return this.insertAndGetId(row, trx);
  }

  async getUserActivity(userId, limit = 50, offset = 0, trx) {
    return this.query(trx)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async getUserStats(userId, trx) {
    if (!userId) return { positive: 0, total: 0, ctr: 0.5 };
    const rows = await this.query(trx).where({ user_id: userId });
    if (!rows.length) return { positive: 0, total: 0, ctr: 0.5 };

    const positiveActions = new Set(['like', 'connection_request', 'accepted', 'positive']);
    const positiveCount = rows.filter((r) => positiveActions.has(r.action)).length;
    return {
      positive: positiveCount,
      total: rows.length,
      ctr: positiveCount / rows.length,
    };
  }

  async getTargetStats(targetUserId, trx) {
    if (!targetUserId) return { positive: 0, total: 0, popularity: 0.5 };
    const rows = await this.query(trx).where({ target_user_id: targetUserId });
    if (!rows.length) return { positive: 0, total: 0, popularity: 0.5 };

    const positiveActions = new Set(['like', 'connection_request', 'accepted', 'positive']);
    const positiveCount = rows.filter((r) => positiveActions.has(r.action)).length;
    return {
      positive: positiveCount,
      total: rows.length,
      popularity: positiveCount / rows.length,
    };
  }
}

module.exports = new ActivityFeedbackModel();

