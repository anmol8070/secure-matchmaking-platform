const BaseModel = require('./BaseModel');

class ProfileModel extends BaseModel {
  constructor() {
    super({ table: 'profiles', primaryKey: 'user_id' });
  }

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
}

module.exports = new ProfileModel();


