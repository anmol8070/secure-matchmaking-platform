/**
 * Admin API validation (Phase 14). Pagination is bounded, statuses and
 * filters come from fixed lists, dates are real calendar days, and bodies
 * are strict (unknown fields → 422).
 */
const config = require('../config/environment');
const { z, id } = require('./commonValidator');
const { isValidDate } = require('../utils/age');
const ENUMS = require('../constants/enums');

const page = z.coerce.number().int().min(1).max(100000).default(1);
const limit = z.coerce.number().int().min(1).max(config.admin.maxPageSize).default(config.admin.defaultPageSize);
const day = z.string().refine(isValidDate, 'Use a real date in YYYY-MM-DD format');

const idParams = z.object({ id: id() });

const rangeQuery = z.object({ from: day.optional(), to: day.optional() });

const listUsersQuery = z.object({
  page,
  limit,
  status: z.enum(ENUMS.USER_STATUSES).optional(),
  role: z.enum(ENUMS.USER_ROLES).optional(),
  // Matched against email, mobile, profile name and (if numeric) user id.
  search: z.string().trim().min(1).max(100).optional(),
});

const userStatusBody = z
  .strictObject({
    status: z.enum(['active', 'suspended'], { error: 'Status must be "active" or "suspended"' }),
    reason: z.string().trim().max(500).optional(),
    reportId: id().optional(),
  })
  .refine((b) => b.status !== 'suspended' || (b.reason && b.reason.length >= 3), {
    message: 'A reason (at least 3 characters) is required to suspend an account',
    path: ['reason'],
  });

const listReportsQuery = z.object({
  page,
  limit,
  status: z.enum(ENUMS.REPORT_STATUSES).optional(),
  reason: z.enum(ENUMS.REPORT_REASONS).optional(),
  reportedUserId: id().optional(),
  reporterId: id().optional(),
  sort: z.enum(['oldest', 'newest']).default('oldest'),
});

const reportStatusBody = z.strictObject({
  status: z.enum(['under_review', 'resolved', 'dismissed'], { error: 'Status must be under_review, resolved or dismissed' }),
  resolutionNote: z.string().trim().max(2000).optional(),
  // Recorded on the report; account changes are made with PUT /admin/users/:id/status.
  actionTaken: z.enum(['none', 'warning', 'suspended']).optional(),
});

const auditQuery = z.object({
  page,
  limit,
  action: z.enum(ENUMS.ADMIN_AUDIT_ACTIONS).optional(),
  targetType: z.enum(['user', 'report', 'ml_model']).optional(),
  targetId: id().optional(),
  adminId: id().optional(),
});

module.exports = { idParams, rangeQuery, listUsersQuery, userStatusBody, listReportsQuery, reportStatusBody, auditQuery };
