/**
 * Admin panel endpoints (Phase 14). HTTP only — rules live in
 * services/adminService.js, reportService.js and auditService.js.
 * Every route except /login runs requireAuth + requireRole('admin');
 * the acting admin is always req.auth.userId.
 */
const authService = require('../services/authService');
const adminService = require('../services/adminService');
const reportService = require('../services/reportService');
const auditService = require('../services/auditService');
const { sendSuccess } = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/enums');

async function login(req, res) {
  const data = await authService.loginWithPassword(req.validated.body, { requiredRole: ROLES.ADMIN });
  sendSuccess(res, { message: 'Credentials verified. Live verification required.', data });
}

async function getDashboard(req, res) {
  sendSuccess(res, { data: await adminService.getDashboard(req.validated.query) });
}

async function listActivity(req, res) {
  sendSuccess(res, { data: await adminService.getActivity(req.validated.query) });
}

async function getMonitoring(req, res) {
  sendSuccess(res, { data: await adminService.getMonitoring() });
}

async function getMlMonitoring(req, res) {
  sendSuccess(res, { data: await adminService.getMlMonitoring() });
}

async function listUsers(req, res) {
  sendSuccess(res, { data: await adminService.listUsers(req.validated.query) });
}

async function getUser(req, res) {
  sendSuccess(res, { data: await adminService.getUser(req.validated.params.id) });
}

async function updateUserStatus(req, res) {
  const user = await adminService.updateUserStatus(req.auth.userId, req.validated.params.id, req.validated.body);
  sendSuccess(res, { message: user.status === 'suspended' ? 'Account suspended.' : 'Account reactivated.', data: { user } });
}

async function listReports(req, res) {
  sendSuccess(res, { data: await reportService.listReportsForReview(req.auth.userId, req.validated.query) });
}

async function getReport(req, res) {
  sendSuccess(res, { data: { report: await reportService.getReportForReview(req.auth.userId, req.validated.params.id) } });
}

async function updateReportStatus(req, res) {
  const report = await reportService.updateReportStatus(req.auth.userId, req.validated.params.id, req.validated.body);
  sendSuccess(res, { message: 'Report updated.', data: { report } });
}

async function listAuditLogs(req, res) {
  sendSuccess(res, { data: await auditService.list(req.validated.query) });
}

/** Phase 9 training, now audited. Runs synchronously (small logistic regression). */
async function trainMlModel(req, res) {
  const { runTrainingPipeline } = require('../ml/scripts/train_model');
  try {
    const result = await runTrainingPipeline();
    await auditService.record({
      adminId: req.auth.userId,
      action: auditService.ACTIONS.ML_TRAINING_RUN,
      targetType: auditService.TARGETS.ML_MODEL,
      metadata: { modelVersion: result.modelVersion, outcome: 'trained' },
    });
    // Metrics only — never the weights or training rows.
    sendSuccess(res, { message: 'ML model training completed', data: { modelVersion: result.modelVersion, metrics: result.metrics } });
  } catch (error) {
    if (error.message === 'Insufficient data for training.') {
      await auditService.record({
        adminId: req.auth.userId,
        action: auditService.ACTIONS.ML_TRAINING_RUN,
        targetType: auditService.TARGETS.ML_MODEL,
        metadata: { outcome: 'insufficient_data' },
      });
      throw ApiError.badRequest('Insufficient interaction data to train the model.');
    }
    logger.error('ML training failed', { error: error.name });
    throw error;
  }
}

module.exports = {
  login,
  getDashboard,
  listActivity,
  getMonitoring,
  getMlMonitoring,
  listUsers,
  getUser,
  updateUserStatus,
  listReports,
  getReport,
  updateReportStatus,
  listAuditLogs,
  trainMlModel,
};
