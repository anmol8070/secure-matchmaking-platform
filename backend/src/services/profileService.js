/**
 * Profile management — later phase.
 *
 * Includes the profile picture (profiles.profile_photo_url): upload from
 * gallery/file or an optional camera capture, update and replace. The profile
 * picture has no connection to login verification (see verificationService).
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService([
  'getOwnProfile',
  'getProfileByUserId',
  'createProfile',
  'updateProfile',
  'uploadProfilePhoto',
  'removeProfilePhoto',
]);
