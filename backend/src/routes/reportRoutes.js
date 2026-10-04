/**
 * /api/v1/reports — reporting other users.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const reports = require('../controllers/reportController');

const router = Router();

router.post('/', reports.createReport);
router.get('/', reports.listOwnReports);

module.exports = router;
