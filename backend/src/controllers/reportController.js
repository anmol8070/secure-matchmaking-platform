/**
 * Reporting users (Phase 13). HTTP only — rules live in services/reportService.js.
 * The reporter is always req.auth.userId. Review/status changes are admin-only (Phase 14).
 */
const reportService = require('../services/reportService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

const CONFIRMATION = 'Thank you. Your report has been received and will be reviewed by our team.';

async function createReport(req, res) {
  const { report, duplicate } = await reportService.createReport(req.auth.userId, req.validated.body);
  if (duplicate) sendSuccess(res, { message: 'You have already reported this user for this reason. Our team will review it.', data: { report } });
  else sendCreated(res, { message: CONFIRMATION, data: { report } });
}

async function listOwnReports(req, res) {
  sendSuccess(res, { data: { reports: await reportService.listOwnReports(req.auth.userId) } });
}

async function listReasons(req, res) {
  sendSuccess(res, { data: { reasons: reportService.reasonOptions() } });
}

module.exports = { createReport, listOwnReports, listReasons };
