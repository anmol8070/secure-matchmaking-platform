/**
 * /api/v1/auth — registration, OTP, login and live presence verification (Phase 4).
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const auth = require('../controllers/authController');

const router = Router();

router.post('/register', auth.register);
router.post('/otp/send', auth.sendOtp);
router.post('/otp/verify', auth.verifyOtp);
router.post('/login', auth.login);
// Receives the browser's face/human *presence* result — never an image.
router.post('/login/verification', auth.submitPresenceVerification);
router.post('/logout', auth.logout);
router.get('/me', auth.getCurrentUser);

module.exports = router;
