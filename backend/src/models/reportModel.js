/** reports — user reports for moderator review (rules in services/reportService.js). */
const BaseModel = require('./BaseModel');

const OPEN = Object.freeze(['pending', 'under_review']);

class ReportModel extends BaseModel {
  constructor() {
    super({ table: 'reports', primaryKey: 'report_id' });
  }

  async create({ reporterId, reportedId, reason, description }, trx) {
    const now = new Date();
    const id = await this.insertAndGetId(
      { reporter_id: reporterId, reported_id: reportedId, reason, description, status: 'pending', created_at: now, updated_at: now },
      trx
    );
    return this.findByPk(id, trx);
  }

  /** An open report by the same reporter about the same user for the same reason. */
  findOpenDuplicate(reporterId, reportedId, reason, trx) {
    return this.query(trx).where({ reporter_id: reporterId, reported_id: reportedId, reason }).whereIn('status', OPEN).first();
  }

  listByReporter(reporterId, trx) {
    return this.query(trx).where({ reporter_id: reporterId }).orderBy('report_id', 'desc').limit(100);
  }

  /**
   * Moderation queue (Phase 14): filters, stable sort (created_at, then id),
   * offset pagination. Returns { rows, total }.
   */
  async listForReview({ status, reason, reportedId, reporterId, sort = 'oldest', limit = 20, offset = 0 } = {}, trx) {
    const filtered = () => {
      const q = this.query(trx);
      if (status) q.where({ status });
      if (reason) q.where({ reason });
      if (reportedId) q.where({ reported_id: reportedId });
      if (reporterId) q.where({ reporter_id: reporterId });
      return q;
    };
    const direction = sort === 'newest' ? 'desc' : 'asc';
    const [rows, count] = await Promise.all([
      filtered().orderBy([{ column: 'created_at', order: direction }, { column: 'report_id', order: direction }]).limit(limit).offset(offset),
      filtered().count({ n: '*' }).first(),
    ]);
    return { rows, total: Number(count.n) };
  }

  /** Open reports per reported user, for the given users → Map(userId → count). */
  async openCountsFor(userIds, trx) {
    if (!userIds.length) return new Map();
    const rows = await this.query(trx).whereIn('reported_id', userIds).whereIn('status', OPEN).select('reported_id').count({ n: '*' }).groupBy('reported_id');
    return new Map(rows.map((r) => [Number(r.reported_id), Number(r.n)]));
  }

  /** Conditional status change; false when the report was not in an allowed state. */
  async transition(reportId, from, changes, trx) {
    const updated = await this.query(trx).where({ report_id: reportId }).whereIn('status', from).update({ ...changes, updated_at: new Date() });
    return updated === 1;
  }
}

module.exports = new ReportModel();
module.exports.OPEN = OPEN;
