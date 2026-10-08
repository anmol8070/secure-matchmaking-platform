const BaseModel = require('./BaseModel');

class UserHobbyModel extends BaseModel {
  constructor() {
    super({ table: 'user_hobbies', primaryKey: ['user_id', 'hobby_id'] });
  }

  async getUserHobbyIds(userId, trx) {
    const rows = await this.query(trx).where({ user_id: userId }).select('hobby_id');
    return rows.map((r) => r.hobby_id);
  }

  async getUserHobbiesWithNames(userId, trx) {
    return this.query(trx)
      .join('hobbies', 'user_hobbies.hobby_id', 'hobbies.hobby_id')
      .where({ 'user_hobbies.user_id': userId })
      .select('hobbies.hobby_id', 'hobbies.hobby_name');
  }
}

module.exports = new UserHobbyModel();


