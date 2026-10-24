/**
 * admin_audit_logs — append-only. There is intentionally no update or
 * delete method: audit history cannot be changed through the application.
 */
const BaseModel = require('./BaseModel');

class AdminAuditLogModel extends BaseModel {
  constructor() {
    super({ table: 'admin_audit_logs', primaryKey: 'audit_id', jsonColumns: ['metadata'] });
  }

  async append({ adminId, action, targetType, targetId = null, reason = null, metadata = null }, trx) {
    const id = await this.insertAndGetId(
      {
        admin_id: adminId,
        action,
        target_type: targetType,
        target_id: targetId,
        reason,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at: new Date(),
      },
      trx
    );
    return this.findByPk(id, trx);
  }

  /** Newest first, filtered; returns { rows, total }. */
  async list({ action, targetType, targetId, adminId, limit, offset }, trx) {
    const filtered = () => {
      const q = this.query(trx);
      if (action) q.where({ action });
      if (targetType) q.where({ target_type: targetType });
      if (targetId) q.where({ target_id: targetId });
      if (adminId) q.where({ admin_id: adminId });
      return q;
    };
    const [rows, count] = await Promise.all([
      filtered().orderBy('audit_id', 'desc').limit(limit).offset(offset),
      filtered().count({ n: '*' }).first(),
    ]);
    return { rows: rows.map((r) => this.parseRow(r)), total: Number(count.n) };
  }
}

module.exports = new AdminAuditLogModel();
