/**
 * Profile endpoints for the authenticated user. HTTP only — rules live in
 * profileService. The user id comes from req.auth (the session), never from
 * the request body or URL.
 */
const profileService = require('../services/profileService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');
const { notImplementedHandler } = require('../utils/notImplemented');

async function getOwnProfile(req, res) {
  sendSuccess(res, { data: await profileService.getOwnProfile(req.auth.userId) });
}

async function createProfile(req, res) {
  const data = await profileService.createProfile(req.auth.userId, req.validated.body);
  sendCreated(res, { message: 'Profile created successfully', data });
}

async function updateProfile(req, res) {
  const data = await profileService.updateProfile(req.auth.userId, req.validated.body);
  sendSuccess(res, { message: 'Profile updated successfully', data });
}

async function uploadProfilePhoto(req, res) {
  const data = await profileService.uploadProfilePhoto(req.auth.userId, req.file);
  sendSuccess(res, { message: 'Profile picture updated successfully', data });
}

async function removeProfilePhoto(req, res) {
  const data = await profileService.removeProfilePhoto(req.auth.userId);
  sendSuccess(res, { message: 'Profile picture removed', data });
}

module.exports = {
  getOwnProfile,
  createProfile,
  updateProfile,
  uploadProfilePhoto,
  removeProfilePhoto,
  // Viewing other members' profiles comes with matching/connections (later phase).
  getProfileByUserId: notImplementedHandler,
};
