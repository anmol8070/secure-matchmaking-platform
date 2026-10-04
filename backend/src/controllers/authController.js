/**
 * Authentication endpoints. HTTP only — all rules live in authService.
 * Request bodies arrive validated and normalised in req.validated.body.
 */
const authService = require('../services/authService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

async function register(req, res) {
  const data = await authService.register(req.validated.body);
  sendCreated(res, { message: 'Registration successful. OTP sent for verification.', data });
}

async function sendOtp(req, res) {
  const { message } = await authService.sendVerificationOtp(req.validated.body);
  sendSuccess(res, { message });
}

async function verifyOtp(req, res) {
  const data = await authService.verifyAccountOtp(req.validated.body);
  sendSuccess(res, { message: 'Account verified. You can now log in.', data });
}

async function login(req, res) {
  const data = await authService.loginWithPassword(req.validated.body);
  sendSuccess(res, { message: 'Credentials verified. Live verification required.', data });
}

async function sendLoginOtp(req, res) {
  const { message } = await authService.sendLoginOtp(req.validated.body);
  sendSuccess(res, { message });
}

async function verifyLoginOtp(req, res) {
  const data = await authService.verifyLoginOtp(req.validated.body);
  sendSuccess(res, { message: 'OTP verified. Live verification required.', data });
}

async function completeLoginVerification(req, res) {
  const data = await authService.completeLoginVerification(req.validated.body);
  sendSuccess(res, { message: 'Login verification successful', data });
}

async function logout(req, res) {
  await authService.logout(req.auth.sessionId);
  sendSuccess(res, { message: 'Logged out successfully' });
}

function getCurrentUser(req, res) {
  sendSuccess(res, { data: authService.getCurrentUser(req.user) });
}

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  login,
  sendLoginOtp,
  verifyLoginOtp,
  completeLoginVerification,
  logout,
  getCurrentUser,
};
