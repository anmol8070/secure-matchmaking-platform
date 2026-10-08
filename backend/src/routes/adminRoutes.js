/**
 * /api/v1/admin — admin panel API.
 * Login is public (role-restricted); every other route requires an
 * authenticated admin. Admin features themselves are later-phase placeholders (501).
 */
const { Router } = require('express');
const admin = require('../controllers/adminController');
const { validate, z, id } = require('../validators/commonValidator');
const { loginBody } = require('../validators/authValidator');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { authLimiter, failedAttemptLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../constants/enums');

const router = Router();
const userIdParams = z.object({ userId: id() });
const reportIdParams = z.object({ reportId: id() });

router.post('/login', authLimiter, failedAttemptLimiter, validate({ body: loginBody }), admin.login);

// Everything below: authenticated admins only.
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/dashboard', admin.getDashboard);

// User management
router.get('/users', admin.listUsers);
router.get('/users/:userId', validate({ params: userIdParams }), admin.getUser);
router.patch('/users/:userId/status', validate({ params: userIdParams }), admin.updateUserStatus);

// Report management
router.get('/reports', admin.listReports);
router.patch('/reports/:reportId', validate({ params: reportIdParams }), admin.reviewReport);

// Activity and monitoring
router.get('/activity', admin.listActivity);
router.get('/monitoring', admin.getMonitoring);

// ML Management
router.post('/ml/train', admin.trainMlModel);

module.exports = router;
