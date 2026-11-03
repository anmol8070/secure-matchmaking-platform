/**
 * Live camera verification at login.
 *
 *   credentials/OTP ok → startVerification() → temporary verification token
 *   browser: live camera → presence (one face) → optional profile-photo match
 *   completeVerification(token, result) → passed → caller issues the JWT
 *
 * Presence: exactly one face reported for this attempt.
 * Profile match: when the account already has a profile picture, the client
 * must report profile_matched: true after comparing the live frame with that
 * picture. The server never receives the image; a client flag alone is not
 * cryptographic proof, but login is refused without it when a photo exists.
 * First login (no photo) enrolls the captured frame as the profile picture
 * on the client after the JWT is issued.
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
  PROFILE_MISMATCH: 'Face does not match your profile picture. Please try again.',
  TOO_MANY_ATTEMPTS: 'Too many verification attempts. Please log in again.',
});

/** Face detected AND exactly one face = presence passed. */
function evaluateDetection({ face_detected: faceDetected, face_count: faceCount }) {
  if (!faceDetected || faceCount === 0) return 'no_face';
  if (faceCount > 1) return 'multiple_faces';
  return 'passed';
}

/**
 * After presence passes: if the account has a profile picture, require an
 * explicit client profile_matched: true from the live comparison.
 * Presence failures are never flipped by a forged match flag.
 */
function applyProfileRule(outcome, { hasProfilePhoto = false, profileMatched } = {}) {
  if (outcome !== 'passed') return outcome;
  if (hasProfilePhoto && profileMatched !== true) return 'profile_mismatch';
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

    const profile = await trx('profiles').select('profile_photo_url').where({ user_id: row.user_id }).first();
    const hasProfilePhoto = Boolean(profile && profile.profile_photo_url);
    const outcome = applyProfileRule(evaluateDetection(detection), {
      hasProfilePhoto,
      profileMatched: detection.profile_matched,
    });
    const attempts = row.attempt_count + 1;
    const exhausted = outcome !== 'passed' && attempts >= config.loginVerification.maxAttempts;
    const identityChecked = hasProfilePhoto && outcome === 'passed';

    await LoginVerification.query(trx)
      .where({ verification_id: row.verification_id })
      .update({
        attempt_count: attempts,
        attempted_at: now,
        detection_result: JSON.stringify({
          face_detected: Boolean(detection.face_detected),
          face_count: Number(detection.face_count),
          ...(detection.confidence !== undefined && { confidence: detection.confidence }),
          ...(detection.detector && { detector: detection.detector }),
          has_profile_photo: hasProfilePhoto,
          client_profile_flag_present: typeof detection.profile_matched === 'boolean',
          profile_matched: detection.profile_matched === true,
          outcome,
          face_presence_verified: evaluateDetection(detection) === 'passed',
          biometric_identity_verified: identityChecked,
          verification_mechanism: hasProfilePhoto
            ? 'live_presence_and_profile_match_challenge'
            : 'live_presence_enroll_profile_photo',
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
    case 'profile_mismatch':
      throw new ApiError(HTTP.UNPROCESSABLE_ENTITY, MESSAGES.PROFILE_MISMATCH);
    case 'too_many':
      throw new ApiError(HTTP.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY_ATTEMPTS);
    default:
      throw new ApiError(HTTP.UNAUTHORIZED, MESSAGES.INVALID_SESSION);
  }
}

module.exports = { startVerification, completeVerification, evaluateDetection, applyProfileRule, MESSAGES };
