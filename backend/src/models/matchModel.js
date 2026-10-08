const BaseModel = require('./BaseModel');

class MatchModel extends BaseModel {
  constructor() {
    super({ table: 'matches', primaryKey: 'match_id', jsonColumns: ['score_breakdown'] });
  }

  async findBetweenUsers(user1Id, user2Id, trx) {
    const row = await this.query(trx)
      .where({ user1_id: user1Id, user2_id: user2Id })
      .first();
    return this.parseRow(row);
  }

  async findByUser(userId, limit = 20, offset = 0, trx) {
    const rows = await this.query(trx)
      .where({ user1_id: userId })
      .orderBy('score', 'desc')
      .limit(limit)
      .offset(offset);
    return rows.map((r) => this.parseRow(r));
  }

  async upsertMatch(user1Id, user2Id, score, scoreBreakdown, trx) {
    const existing = await this.findBetweenUsers(user1Id, user2Id, trx);
    const now = new Date();
    const breakdownJson = typeof scoreBreakdown === 'string' ? scoreBreakdown : JSON.stringify(scoreBreakdown);

    if (existing) {
      await this.query(trx)
        .where({ match_id: existing.match_id })
        .update({
          score,
          score_breakdown: breakdownJson,
          updated_at: now,
        });
      return existing.match_id;
    }

    return this.insertAndGetId(
      {
        user1_id: user1Id,
        user2_id: user2Id,
        score,
        score_breakdown: breakdownJson,
        created_at: now,
        updated_at: now,
      },
      trx
    );
  }
}

module.exports = new MatchModel();

