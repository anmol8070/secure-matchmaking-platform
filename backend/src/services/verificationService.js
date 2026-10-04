/**
 * Live human/face PRESENCE verification at login — later phase.
 *
 *   Login → live camera (browser) → face/human detection (browser) →
 *   verification result sent here → login completed
 *
 * This service answers "is a live human/face present?" — never "whose face is
 * this?". It receives only the detector outcome (e.g. face_detected,
 * faces_count, confidence), records it in login_verifications, and never
 * receives, stores or compares images. It is intentionally independent of
 * profileService and of profile photos.
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService([
  'startVerification',
  'submitDetectionResult',
  'getVerificationStatus',
]);
