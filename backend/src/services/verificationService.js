/**
 * Live human/face PRESENCE verification at login.
 *
 *   credentials/OTP ok → startVerification() → temporary verification token
 *   browser: live camera → capture → face detection (MediaPipe) → result
 *   completeVerification(token, result) → passed → caller issues the JWT
 *
 * This answers only "is exactly one live face present?" — never "whose face
 * is this?". No image is received or stored; only the detector outcome is
 * recorded in login_verifications.detection_result. There is no relationship
 * with profile pictures (profileService), which are a separate feature.
 *
 * The temporary token is an opaque random value (stored as a SHA-256 hash),
 * single-use, short-lived and NOT a JWT — the auth middleware cannot accept it.
 */
const config = require('../config/environment');
const { getDb } = require('../config/database');
const LoginVerification = require('../models/loginVerificationModel');
const ApiError = require('../utils/ApiError');
const HTTP = require('../constants/httpStatus');
const { generateToken, sha256 } = require('../utils/securityTokens');

const MESSAGES = Object.freeze({
  INVALID_SESSION: 'Invalid or expired verification session. Please log in again.',
  NO_FACE: 'No face detected. Please take the photo again.',
  MULTIPLE_FACES: 'Multiple faces detected. Please ensure only one person is visible.',
  TOO_MANY_ATTEMPTS: 'Too many verification attempts. Please log in again.',
});

/** Initial rule: face detected AND exactly one face = passed. */
function evaluateDetection({ face_detected: faceDetected, face_count: faceCount }) {
  if (!faceDetected || faceCount === 0) return 'no_face';
  if (faceCount > 1) return 'multiple_faces';
  return 'passed';
}

/** Creates a pending verification session after successful authentication. */
async function startVerification(user, authMethod) {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + config.loginVerification.expiryMinutes * 60 * 1000);

  await LoginVerification.query().insert({
    user_id: user.user_id,
    verification_status: 'pending',
    token_hash: sha256(token),
    expires_at: expiresAt,
    auth_method: authMethod,
  });

  return { token, expiresAt, expiresIn: config.loginVerification.expiryMinutes * 60 };
}

/**
 * Records one detection attempt. On success returns the verification row;
 * otherwise throws with a retry message (the session stays pending) or a
 * terminal error (expired / used / too many attempts).
 */
async function completeVerification(token, detection) {
  const now = new Date();
  const result = await getDb().transaction(async (trx) => {
    const row = await LoginVerification.query(trx).where({ token_hash: sha256(token) }).forUpdate().first();
    if (!row || row.verification_status !== 'pending') return { outcome: 'invalid' };

    if (!row.expires_at || new Date(row.expires_at) <= now) {
      await LoginVerification.query(trx)
        .where({ verification_id: row.verification_id })
        .update({ verification_status: 'expired' });
      return { outcome: 'invalid' };
    }

    const outcome = evaluateDetection(detection);
    const attempts = row.attempt_count + 1;
    const exhausted = outcome !== 'passed' && attempts >= config.loginVerification.maxAttempts;

    await LoginVerification.query(trx)
      .where({ verification_id: row.verification_id })
      .update({
        attempt_count: attempts,
        attempted_at: now,
        // Detector outcome only — no image, no biometric data.
        detection_result: JSON.stringify({
          face_detected: detection.face_detected,
          face_count: detection.face_count,
          ...(detection.confidence !== undefined && { confidence: detection.confidence }),
          ...(detection.detector && { detector: detection.detector }),
          outcome,
        }),
        ...(outcome === 'passed' && { verification_status: 'passed', verified_at: now }),
        ...(exhausted && { verification_status: 'failed' }),
      });

    return { outcome: exhausted ? 'too_many' : outcome, row };
  });

  switch (result.outcome) {
    case 'passed':
      return result.row;
    case 'no_face':
      throw new ApiError(HTTP.UNPROCESSABLE_ENTITY, MESSAGES.NO_FACE);
    case 'multiple_faces':
      throw new ApiError(HTTP.UNPROCESSABLE_ENTITY, MESSAGES.MULTIPLE_FACES);
    case 'too_many':
      throw new ApiError(HTTP.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY_ATTEMPTS);
    default:
      throw new ApiError(HTTP.UNAUTHORIZED, MESSAGES.INVALID_SESSION);
  }
}

module.exports = { startVerification, completeVerification, evaluateDetection, MESSAGES };
