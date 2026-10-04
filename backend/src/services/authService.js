/**
 * Authentication service — Phase 4.
 * Registration, OTP issue/verification, login, JWT issue/revocation.
 * The live presence check at login is delegated to verificationService.
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService([
  'register',
  'sendOtp',
  'verifyOtp',
  'login',
  'logout',
  'getCurrentUser',
]);
