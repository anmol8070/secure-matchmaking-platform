const BaseModel = require('./BaseModel');

class BlockModel extends BaseModel {
  constructor() {
    super({ table: 'blocks', primaryKey: 'block_id' });
  }

  async getBlockedUserIds(userId, trx) {
    const blocksByMe = await this.query(trx).where({ blocker_id: userId }).select('blocked_id');
    const blocksOfMe = await this.query(trx).where({ blocked_id: userId }).select('blocker_id');

    const set = new Set([
      ...blocksByMe.map((b) => b.blocked_id),
      ...blocksOfMe.map((b) => b.blocker_id),
    ]);
    return Array.from(set);
  }

  async isBlocked(user1Id, user2Id, trx) {
    const record = await this.query(trx)
      .where((q) => {
        q.where({ blocker_id: user1Id, blocked_id: user2Id }).orWhere({
          blocker_id: user2Id,
          blocked_id: user1Id,
        });
      })
      .first();
    return Boolean(record);
  }

  async blockUser(blockerId, blockedId, trx) {
    const existing = await this.query(trx).where({ blocker_id: blockerId, blocked_id: blockedId }).first();
    if (existing) return existing.block_id;
    return this.insertAndGetId(
      {
        blocker_id: blockerId,
        blocked_id: blockedId,
        created_at: new Date(),
      },
      trx
    );
  }

  async unblockUser(blockerId, blockedId, trx) {
    return this.query(trx).where({ blocker_id: blockerId, blocked_id: blockedId }).del();
  }

  async listBlockedUsers(userId, trx) {
    return this.query(trx).where({ blocker_id: userId });
  }
}

module.exports = new BlockModel();

