const BaseModel = require('./BaseModel');

class ConnectionRequestModel extends BaseModel {
  constructor() {
    super({ table: 'connection_requests', primaryKey: 'request_id' });
  }

  async findBetween(user1Id, user2Id, trx) {
    return this.query(trx)
      .where((q) => {
        q.where({ sender_id: user1Id, receiver_id: user2Id }).orWhere({
          sender_id: user2Id,
          receiver_id: user1Id,
        });
      })
      .first();
  }

  async listForUser(userId, status = null, trx) {
    const q = this.query(trx).where((sub) => {
      sub.where({ sender_id: userId }).orWhere({ receiver_id: userId });
    });
    if (status) q.andWhere({ status });
    return q.orderBy('created_at', 'desc');
  }

  async sendRequest(senderId, receiverId, trx) {
    const existing = await this.findBetween(senderId, receiverId, trx);
    if (existing) {
      if (existing.status === 'rejected') {
        await this.query(trx)
          .where({ request_id: existing.request_id })
          .update({ sender_id: senderId, receiver_id: receiverId, status: 'pending', updated_at: new Date() });
        return existing.request_id;
      }
      return existing.request_id;
    }
    const now = new Date();
    return this.insertAndGetId(
      {
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
        created_at: now,
        updated_at: now,
      },
      trx
    );
  }

  async updateStatus(requestId, status, trx) {
    const now = new Date();
    await this.query(trx).where({ request_id: requestId }).update({ status, updated_at: now });
    return this.findByPk(requestId, trx);
  }
}

module.exports = new ConnectionRequestModel();

