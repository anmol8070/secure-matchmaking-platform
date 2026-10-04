/**
 * Admin panel operations — later phase. Admin login itself goes through
 * authService (users.role = 'admin'); authorization is added in Phase 4.
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService([
  'getDashboard',
  'listUsers',
  'getUser',
  'updateUserStatus',
  'listReports',
  'reviewReport',
  'listActivity',
  'getMonitoring',
]);
