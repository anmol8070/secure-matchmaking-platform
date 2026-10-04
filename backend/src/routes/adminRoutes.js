/**
 * /api/v1/admin — admin panel API (authorization added in Phase 4).
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const admin = require('../controllers/adminController');
const { validate, z, id } = require('../validators/commonValidator');

const router = Router();
const userIdParams = z.object({ userId: id() });
const reportIdParams = z.object({ reportId: id() });

router.post('/login', admin.login);
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

module.exports = router;
