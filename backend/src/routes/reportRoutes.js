/**
 * /api/v1/reports — reporting other users (Phase 13). Protected by requireAuth.
 * Moderation (listing all reports, changing status) is under /admin (Phase 14).
 */
const { Router } = require('express');
const reports = require('../controllers/reportController');
const { validate } = require('../validators/commonValidator');
const { createReportBody } = require('../validators/reportValidator');

const router = Router();

router.get('/reasons', reports.listReasons);
router.post('/', validate({ body: createReportBody }), reports.createReport);
router.get('/', reports.listOwnReports);

module.exports = router;
