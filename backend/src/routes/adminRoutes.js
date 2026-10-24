/**
 * /api/v1/admin — admin panel API (Phase 14).
 *
 * POST /login is public but only accepts admin accounts (then live
 * verification, as for users). Every other route requires an authenticated
 * admin: requireAuth re-reads the session, role and account status from the
 * database on every request, then requireRole('admin'). Ordinary users get
 * 403. Requests are rate-limited per admin, moderation actions more strictly.
 */
const { Router } = require('express');
const admin = require('../controllers/adminController');
const { validate } = require('../validators/commonValidator');
const { loginBody } = require('../validators/authValidator');
const v = require('../validators/adminValidator');
const config = require('../config/environment');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { authLimiter, failedAttemptLimiter, createLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../constants/enums');

const router = Router();

const perAdmin = (req) => `admin:${req.auth.userId}`;
const adminLimiter = createLimiter({
  limit: config.admin.requestRateLimit,
  windowMinutes: 1,
  keyGenerator: perAdmin,
  message: 'Too many admin requests. Please slow down.',
});
const actionLimiter = createLimiter({
  limit: config.admin.actionRateLimit,
  windowMinutes: 1,
  keyGenerator: (req) => `admin-action:${req.auth.userId}`,
  message: 'Too many moderation actions in a short time. Please wait a moment.',
});
const trainingLimiter = createLimiter({
  limit: 2,
  windowMinutes: 10,
  keyGenerator: (req) => `admin-train:${req.auth.userId}`,
  message: 'Model training was started recently. Please wait before starting it again.',
});

router.post('/login', authLimiter, failedAttemptLimiter, validate({ body: loginBody }), admin.login);

// Everything below: authenticated admins only.
router.use(requireAuth, requireRole(ROLES.ADMIN), adminLimiter);

// Overview and monitoring
router.get('/dashboard', validate({ query: v.rangeQuery }), admin.getDashboard);
router.get('/activity', validate({ query: v.rangeQuery }), admin.listActivity);
router.get('/monitoring', admin.getMonitoring);
router.get('/ml', admin.getMlMonitoring);
router.post('/ml/train', trainingLimiter, admin.trainMlModel);

// User management
router.get('/users', validate({ query: v.listUsersQuery }), admin.listUsers);
router.get('/users/:id', validate({ params: v.idParams }), admin.getUser);
router.put('/users/:id/status', actionLimiter, validate({ params: v.idParams, body: v.userStatusBody }), admin.updateUserStatus);

// Report moderation
router.get('/reports', validate({ query: v.listReportsQuery }), admin.listReports);
router.get('/reports/:id', validate({ params: v.idParams }), admin.getReport);
router.put('/reports/:id/status', actionLimiter, validate({ params: v.idParams, body: v.reportStatusBody }), admin.updateReportStatus);

// Audit history (read-only — there is no route that changes it)
router.get('/audit-logs', validate({ query: v.auditQuery }), admin.listAuditLogs);

module.exports = router;
