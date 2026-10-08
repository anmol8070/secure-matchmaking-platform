const BaseModel = require('./BaseModel');

class QuizAnswerModel extends BaseModel {
  constructor() {
    super({ table: 'quiz_answers', primaryKey: 'id' });
  }

  async getUserAnswers(userId, trx) {
    return this.query(trx).where({ user_id: userId });
  }
}

module.exports = new QuizAnswerModel();

