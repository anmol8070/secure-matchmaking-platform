/** Authentication: registration, OTP, login, live presence verification, logout.
 * Phase 3: every handler is a 501 placeholder — no business logic yet. */
const { placeholderController } = require('../utils/notImplemented');

module.exports = placeholderController([
  'register',
  'sendOtp',
  'verifyOtp',
  'login',
  'submitPresenceVerification',
  'logout',
  'getCurrentUser',
]);
