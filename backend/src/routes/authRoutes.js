/**
 * /api/v1/auth — registration, OTP, login, live presence verification, session.
 *
 * Every route is rate limited per IP; routes that check a secret (password,
 * OTP, verification token) also count failures per IP + account.
 */
const { Router } = require('express');
const auth = require('../controllers/authController');
const { validate } = require('../validators/commonValidator');
const schemas = require('../validators/authValidator');
const { requireAuth } = require('../middleware/authMiddleware');
const { authLimiter, failedAttemptLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.use(authLimiter);

// Registration and account verification
router.post('/register', validate({ body: schemas.registerBody }), auth.register);
router.post('/send-otp', validate({ body: schemas.sendOtpBody }), auth.sendOtp);
router.post('/verify-otp', failedAttemptLimiter, validate({ body: schemas.verifyOtpBody }), auth.verifyOtp);

// Login step 1: password or OTP → verification token (not an access token)
router.post('/login', failedAttemptLimiter, validate({ body: schemas.loginBody }), auth.login);
router.post('/login/send-otp', validate({ body: schemas.loginSendOtpBody }), auth.sendLoginOtp);
router.post(
  '/login/verify-otp',
  failedAttemptLimiter,
  validate({ body: schemas.loginVerifyOtpBody }),
  auth.verifyLoginOtp
);

// Login step 2: live face/human presence result → access token
router.post(
  '/login-verification/complete',
  failedAttemptLimiter,
  validate({ body: schemas.completeVerificationBody }),
  auth.completeLoginVerification
);

// Authenticated
router.post('/logout', requireAuth, auth.logout);
router.get('/me', requireAuth, auth.getCurrentUser);

module.exports = router;
