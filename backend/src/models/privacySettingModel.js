/** privacy_settings — one row per user; missing row = defaults (privacyService). */
const BaseModel = require('./BaseModel');

class PrivacySettingModel extends BaseModel {
  constructor() {
    super({ table: 'privacy_settings', primaryKey: 'user_id' });
  }

  /** Rows for several users at once (lists of cards). */
  findMany(userIds, trx) {
    if (!userIds.length) return Promise.resolve([]);
    return this.query(trx).whereIn('user_id', userIds);
  }

  /** Inserts or updates the user's row (only the given columns change). */
  async upsert(userId, changes, trx) {
    const now = new Date();
    const existing = await this.query(trx).where({ user_id: userId }).first();
    if (existing) await this.query(trx).where({ user_id: userId }).update({ ...changes, updated_at: now });
    else await this.query(trx).insert({ user_id: userId, ...changes, created_at: now, updated_at: now });
    return this.findByPk(userId, trx);
  }
}

module.exports = new PrivacySettingModel();
