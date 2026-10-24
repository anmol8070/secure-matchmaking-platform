/**
 * Live human/face PRESENCE verification at login.
 *
 *   credentials/OTP ok → startVerification() → temporary verification token
 *   browser: live camera → capture → face detection (MediaPipe) → result
 *   completeVerification(token, result) → passed → caller issues the JWT
 *
 * This answers "is exactly one face reported for this login attempt?".
 * The result is bound to that attempt's opaque token, which expires and
 * cannot be reused. A client profile_matched flag is not evidence: the
 * server never receives the image, so it cannot check a face comparison.
 * No camera image is received or stored. Login is not identity recognition.
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

/** Face detected AND exactly one face = passed. */
function evaluateDetection({ face_detected: faceDetected, face_count: faceCount }) {
  if (!faceDetected || faceCount === 0) return 'no_face';
  if (faceCount > 1) return 'multiple_faces';
  return 'passed';
}

/**
 * Presence outcome only. Extra client fields, including a profile-photo
 * claim, do not change the result. Kept so callers and tests have one
 * function for "what the server is willing to believe".
 */
function applyProfileRule(outcome) {
  return outcome;
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

    const outcome = applyProfileRule(evaluateDetection(detection));
    const attempts = row.attempt_count + 1;
    const exhausted = outcome !== 'passed' && attempts >= config.loginVerification.maxAttempts;

    await LoginVerification.query(trx)
      .where({ verification_id: row.verification_id })
      .update({
        attempt_count: attempts,
        attempted_at: now,
        // Security audit: presence outcome and challenge verification only.
        // The server does NOT receive images or verify biometric identity.
        detection_result: JSON.stringify({
          face_detected: Boolean(detection.face_detected),
          face_count: Number(detection.face_count),
          ...(detection.confidence !== undefined && { confidence: detection.confidence }),
          ...(detection.detector && { detector: detection.detector }),
          client_profile_flag_present: typeof detection.profile_matched === 'boolean',
          outcome,
          face_presence_verified: outcome === 'passed',
          biometric_identity_verified: false,
          verification_mechanism: 'live_presence_session_challenge',
          attempted_at: now.toISOString(),
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

module.exports = { startVerification, completeVerification, evaluateDetection, applyProfileRule, MESSAGES };
