/**
 * Request schemas for /api/v1/auth — rules are added in Phase 4.
 *
 * Planned schemas:
 *   registerBody      email and/or mobile (+ optional password)
 *   sendOtpBody       channel (email|mobile) + destination
 *   verifyOtpBody     destination + 6-digit code
 *   loginBody         email|mobile (+ password or OTP)
 *   presenceBody      verification session id + detector outcome
 *                     (face_detected, faces_count, confidence). Never an image.
 */
module.exports = {};
