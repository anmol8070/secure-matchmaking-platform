/**
 * Phase 13 — user reports.
 *
 * Users file reports; moderators review them in the Admin Panel (Phase 14
 * wires adminRoutes to the review functions at the bottom). Rules:
 *   - the reporter is always the authenticated user;
 *   - the reason is one of REASONS; the description is optional (≤ 2000);
 *   - a repeat of an OPEN report by the same reporter about the same user
 *     for the same reason returns the existing report instead of a new row
 *     (reports by different users are never merged or discarded);
 *   - submissions are rate-limited per user;
 *   - a report never suspends or changes anyone's account automatically;
 *   - reporters see only their own reports, with a coarse open/closed state
 *     — never moderator notes, actions or who reviewed it.
 */
const config = require('../config/environment');
const { Profile, Report, User } = require('../models');
const { OPEN } = require('../models/reportModel');
const privacyService = require('./privacyService');
const auditService = require('./auditService');
const { getDb } = require('../config/database');
const { createRateLimiter } = require('./messageRateLimiter');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const logger = require('../utils/logger');

const REASONS = Object.freeze({
  harassment: 'Harassment or abusive behaviour',
  spam: 'Spam',
  fake_profile: 'Fake or misleading profile',
  inappropriate_content: 'Inappropriate content',
  threatening: 'Threatening behaviour',
  other: 'Other',
});
const STATUSES = Object.freeze(['pending', 'under_review', 'resolved', 'dismissed']);
const ACTIONS = Object.freeze(['none', 'warning', 'content_removed', 'suspended', 'banned']);
const MAX_DESCRIPTION = 2000;

/** Moderator status changes allowed (closed reports stay closed). */
const TRANSITIONS = Object.freeze({
  under_review: ['pending'],
  resolved: ['pending', 'under_review'],
  dismissed: ['pending', 'under_review'],
});

const limiter = createRateLimiter({
  name: 'report',
  limit: () => config.reports.rateLimitPerHour,
  windowMs: () => 60 * 60 * 1000,
});

const toIso = (value) => (value ? new Date(value).toISOString() : null);

/** What the reporter may see about their own report. */
function forReporter(row, reportedUser) {
  return {
    id: Number(row.report_id),
    reportedUserId: Number(row.reported_id),
    ...(reportedUser !== undefined && { reportedUser }),
    reason: row.reason,
    description: row.description || null,
    state: OPEN.includes(row.status) ? 'open' : 'closed',
    createdAt: toIso(row.created_at),
  };
}

/**
 * Files a report. Returns { report, duplicate }.
 * `input` is validated by reportValidator (known reason, bounded description).
 */
async function createReport(reporterId, { reportedUserId, reason, description }) {
  if (Number(reporterId) === Number(reportedUserId)) throw ApiError.badRequest('You cannot report yourself.');
  const reported = await User.findByPk(reportedUserId);
  if (!reported || reported.status === 'deleted') throw ApiError.notFound('User not found.');

  const existing = await Report.findOpenDuplicate(reporterId, reportedUserId, reason);
  if (existing) return { report: forReporter(existing), duplicate: true };

  if (!(await limiter.consume(reporterId))) {
    throw new ApiError(HTTP.TOO_MANY_REQUESTS, 'You have sent many reports recently. Please try again later.');
  }
  const row = await Report.create({ reporterId, reportedId: reportedUserId, reason, description: description || null });
  // Metadata only: the description may contain personal details.
  logger.info('Report filed', { reportId: Number(row.report_id), reporterId: Number(reporterId), reportedId: Number(reportedUserId), reason });
  return { report: forReporter(row), duplicate: false };
}

/** The reporter's own reports, newest first. */
async function listOwnReports(reporterId) {
  const rows = await Report.listByReporter(reporterId);
  const profiles = await Profile.query().whereIn('user_id', [...new Set(rows.map((r) => r.reported_id))]);
  const byId = new Map(profiles.map((p) => [Number(p.user_id), p]));
  const cards = await privacyService.cardsFor(
    reporterId,
    rows.map((r) => ({ userId: r.reported_id, profile: byId.get(Number(r.reported_id)) })),
    { asRelationship: privacyService.RELATIONSHIP.MEMBER }
  );
  return rows.map((row) => forReporter(row, cards.get(Number(row.reported_id)) || null));
}

function reasonOptions() {
  return Object.entries(REASONS).map(([value, label]) => ({ value, label }));
}

/* ---------------- moderation (admin panel, Phase 14) ---------------- */

async function assertAdmin(adminId) {
  const admin = await User.findByPk(adminId);
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw ApiError.forbidden();
}

/** Who is involved — identity and account state only (no profile details, no messages). */
async function userSummaries(userIds) {
  const ids = [...new Set(userIds.map(Number))];
  if (!ids.length) return new Map();
  const rows = await User.query()
    .leftJoin('profiles', 'profiles.user_id', 'users.user_id')
    .whereIn('users.user_id', ids)
    .select('users.user_id', 'users.email', 'users.status', 'users.role', 'profiles.name');
  return new Map(
    rows.map((r) => [Number(r.user_id), { userId: Number(r.user_id), name: r.name || null, email: r.email || null, status: r.status, role: r.role }])
  );
}

/** Full report for moderators (includes notes/actions). */
function forModerator(row, users = new Map(), openAgainst = new Map()) {
  return {
    id: Number(row.report_id),
    reporterId: Number(row.reporter_id),
    reporter: users.get(Number(row.reporter_id)) || null,
    reportedUserId: Number(row.reported_id),
    reportedUser: users.get(Number(row.reported_id)) || null,
    reportedUserOpenReports: openAgainst.get(Number(row.reported_id)) ?? null,
    reason: row.reason,
    reasonLabel: REASONS[row.reason] || row.reason,
    description: row.description || null,
    status: row.status,
    actionTaken: row.action_taken || null,
    resolutionNote: row.resolution_note || null,
    reviewedBy: row.reviewed_by ? Number(row.reviewed_by) : null,
    reviewedAt: toIso(row.reviewed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Paginated moderation queue. */
async function listReportsForReview(adminId, { page = 1, limit = 20, status, reason, reportedUserId, reporterId, sort = 'oldest' } = {}) {
  await assertAdmin(adminId);
  const { rows, total } = await Report.listForReview({ status, reason, reportedId: reportedUserId, reporterId, sort, limit, offset: (page - 1) * limit });
  const users = await userSummaries(rows.flatMap((r) => [r.reporter_id, r.reported_id]));
  const openAgainst = await Report.openCountsFor([...new Set(rows.map((r) => Number(r.reported_id)))]);
  return {
    reports: rows.map((r) => forModerator(r, users, openAgainst)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** One report with both users' identity, the reported user's open-report count and the review history. */
async function getReportForReview(adminId, reportId) {
  await assertAdmin(adminId);
  const row = await Report.findByPk(reportId);
  if (!row) throw ApiError.notFound('Report not found.');
  const users = await userSummaries([row.reporter_id, row.reported_id]);
  const openAgainst = await Report.openCountsFor([Number(row.reported_id)]);
  return { ...forModerator(row, users, openAgainst), history: await auditService.historyFor(auditService.TARGETS.REPORT, reportId) };
}

/**
 * Moderator decision: status (under_review | resolved | dismissed), an
 * optional note and the action taken. The status change and its audit
 * entry are written in one transaction; the status condition makes
 * concurrent decisions safe (the second gets 409). Suspending the account
 * is a separate, explicit admin action (PUT /admin/users/:id/status with
 * this reportId) — a report never changes an account by itself.
 */
async function updateReportStatus(adminId, reportId, { status, resolutionNote = null, actionTaken = null }) {
  await assertAdmin(adminId);
  if (!TRANSITIONS[status]) throw ApiError.badRequest('Unsupported report status.');
  if (actionTaken && !ACTIONS.includes(actionTaken)) throw ApiError.badRequest('Unsupported moderation action.');
  const row = await Report.findByPk(reportId);
  if (!row) throw ApiError.notFound('Report not found.');
  if (!TRANSITIONS[status].includes(row.status)) throw ApiError.conflict(`A ${row.status.replace('_', ' ')} report cannot become ${status.replace('_', ' ')}.`);

  await getDb().transaction(async (trx) => {
    const changed = await Report.transition(
      reportId,
      TRANSITIONS[status],
      {
        status,
        reviewed_by: adminId,
        reviewed_at: new Date(),
        ...(resolutionNote !== null && { resolution_note: resolutionNote }),
        ...(actionTaken !== null && { action_taken: actionTaken }),
      },
      trx
    );
    if (!changed) throw ApiError.conflict('The report was updated by someone else. Reload and try again.');
    await auditService.record(
      {
        adminId,
        action: auditService.ACTIONS.REPORT_STATUS_CHANGED,
        targetType: auditService.TARGETS.REPORT,
        targetId: reportId,
        reason: resolutionNote ? resolutionNote.slice(0, 500) : null,
        metadata: { from: row.status, to: status, ...(actionTaken && { actionTaken }), reportedUserId: Number(row.reported_id) },
      },
      trx
    );
  });
  logger.info('Report reviewed', { reportId: Number(reportId), status, adminId: Number(adminId), actionTaken });
  return getReportForReview(adminId, reportId);
}

module.exports = {
  createReport,
  listOwnReports,
  reasonOptions,
  listReportsForReview,
  getReportForReview,
  updateReportStatus,
  resetForTests: () => limiter.reset(),
  REASONS,
  STATUSES,
  ACTIONS,
  MAX_DESCRIPTION,
};
