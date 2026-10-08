const BaseModel = require('./BaseModel');

class ProfileModel extends BaseModel {
  constructor() {
    super({ table: 'profiles', primaryKey: 'user_id' });
  }

  /**
   * Returns candidate profiles for the eligible candidate pool.
   * Excludes the requesting user, any blocked users (both directions),
   * and users whose account status is not 'active'.
   */
  async getEligibleCandidates(userId, excludedUserIds = [], trx) {
    const excludeSet = new Set([userId, ...excludedUserIds]);
    const q = this.query(trx)
      .join('users', 'profiles.user_id', 'users.user_id')
      .where('users.status', 'active');
    if (excludeSet.size > 0) {
      q.whereNotIn('profiles.user_id', Array.from(excludeSet));
    }
    return q.select('profiles.*');
  }

  /**
   * Fetches a single candidate profile only when their account is active.
   * Returns null when the profile does not exist or the account is inactive.
   * Used by getMatchDetails to enforce account-status and profile existence checks.
   */
  async getActiveProfileById(userId, trx) {
    const row = await this.query(trx)
      .join('users', 'profiles.user_id', 'users.user_id')
      .where('profiles.user_id', userId)
      .where('users.status', 'active')
      .select('profiles.*')
      .first();
    return row || null;
  }
}

module.exports = new ProfileModel();


