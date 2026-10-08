/**
 * Admin panel.
 * Phase 4: login is implemented (same flow as users, restricted to role=admin,
 * including live presence verification). Everything else is a 501 placeholder.
 */
const authService = require('../services/authService');
const { sendSuccess } = require('../utils/apiResponse');
const { ROLES } = require('../constants/enums');
const { placeholderController } = require('../utils/notImplemented');

async function login(req, res) {
  const data = await authService.loginWithPassword(req.validated.body, { requiredRole: ROLES.ADMIN });
  sendSuccess(res, { message: 'Credentials verified. Live verification required.', data });
}

async function trainMlModel(req, res) {
  // We trigger the training asynchronously so the request doesn't timeout,
  // or we can await it if we expect it to be fast. Given this is a small 
  // logistic regression, we can await it.
  const { runTrainingPipeline } = require('../ml/scripts/train_model');
  
  try {
    const result = await runTrainingPipeline();
    sendSuccess(res, { message: 'ML model training completed', data: result });
  } catch (error) {
    if (error.message === 'Insufficient data for training.') {
      return res.status(400).json({ success: false, message: 'Insufficient interaction data to train the model.' });
    }
    throw error;
  }
}

module.exports = {
  login,
  trainMlModel,
  ...placeholderController([
    'getDashboard',
    'listUsers',
    'getUser',
    'updateUserStatus',
    'listReports',
    'reviewReport',
    'listActivity',
    'getMonitoring',
  ]),
};
