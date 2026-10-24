/**
 * Admin audit log (Phase 14). Every sensitive admin action is recorded here,
 * inside the same transaction as the change it describes, so a change
 * without an audit entry (or an entry without the change) cannot happen.
 *
 * Entries are append-only and hold ids, the action, a short reason and
 * small metadata — never passwords, OTPs, tokens or message text.
 * Only admins can read them (GET /admin/audit-logs).
 */
const { AdminAuditLog, User } = require('../models');

const ACTIONS = Object.freeze({
  USER_SUSPENDED: 'user_suspended',
  USER_REACTIVATED: 'user_reactivated',
  REPORT_STATUS_CHANGED: 'report_status_changed',
  ML_TRAINING_RUN: 'ml_training_run',
});
const TARGETS = Object.freeze({ USER: 'user', REPORT: 'report', ML_MODEL: 'ml_model' });

const toIso = (value) => (value ? new Date(value).toISOString() : null);

function format(row, admins = new Map()) {
  return {
    id: Number(row.audit_id),
    adminId: row.admin_id === null ? null : Number(row.admin_id),
    adminEmail: admins.get(Number(row.admin_id)) || null,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id === null ? null : Number(row.target_id),
    reason: row.reason || null,
    metadata: row.metadata || null,
    createdAt: toIso(row.created_at),
  };
}

/** Appends one entry (pass the transaction of the audited change). */
async function record({ adminId, action, targetType, targetId, reason, metadata }, trx) {
  return format(await AdminAuditLog.append({ adminId, action, targetType, targetId, reason, metadata }, trx));
}

/** Paginated history, newest first. */
async function list({ page, limit, action, targetType, targetId, adminId }) {
  const { rows, total } = await AdminAuditLog.list({ action, targetType, targetId, adminId, limit, offset: (page - 1) * limit });
  const adminIds = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))];
  const admins = new Map(
    adminIds.length ? (await User.query().whereIn('user_id', adminIds).select('user_id', 'email')).map((u) => [Number(u.user_id), u.email]) : []
  );
  return { entries: rows.map((r) => format(r, admins)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/** All entries for one target (e.g. a report's review history), oldest first. */
async function historyFor(targetType, targetId) {
  const { entries } = await list({ page: 1, limit: 100, targetType, targetId });
  return entries.reverse();
}

module.exports = { record, list, historyFor, ACTIONS, TARGETS };
