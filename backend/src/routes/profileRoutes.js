/**
 * /api/v1/profile — the authenticated user's own profile and profile picture.
 * Mounted behind requireAuth in routes.js:
 *   route → requireAuth → validation/upload → controller → profileService → DB
 */
const { Router } = require('express');
const profile = require('../controllers/profileController');
const { validate } = require('../validators/commonValidator');
const { createProfileBody, updateProfileBody, userIdParams } = require('../validators/profileValidator');
const { uploadProfileImage } = require('../middleware/uploadMiddleware');
const { createLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Image processing is relatively expensive; limit uploads per user.
const photoUploadLimiter = createLimiter({
  limit: 30,
  keyGenerator: (req) => `profile-photo:${req.auth.userId}`,
  message: 'Too many photo uploads. Please wait a few minutes and try again.',
});

router.get('/', profile.getOwnProfile);
router.post('/', validate({ body: createProfileBody }), profile.createProfile);
router.put('/', validate({ body: updateProfileBody }), profile.updateProfile);

// Profile picture (multipart field "photo"): upload or replace, and remove.
router.put('/photo', photoUploadLimiter, uploadProfileImage, profile.uploadProfilePhoto);
router.delete('/photo', profile.removeProfilePhoto);

// Other members' profiles — later phase (501).
router.get('/:userId', validate({ params: userIdParams }), profile.getProfileByUserId);

module.exports = router;
