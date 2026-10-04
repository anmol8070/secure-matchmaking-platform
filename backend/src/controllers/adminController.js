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

module.exports = {
  login,
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
