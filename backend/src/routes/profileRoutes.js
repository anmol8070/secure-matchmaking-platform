/**
 * /api/v1/profile — the current user's profile and profile picture.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const profile = require('../controllers/profileController');
const { validate } = require('../validators/commonValidator');
const { userIdParams } = require('../validators/profileValidator');

const router = Router();

router.get('/', profile.getOwnProfile);
router.post('/', profile.createProfile);
router.put('/', profile.updateProfile);
// Profile picture: gallery/file upload or optional camera image; replaces the existing one.
router.put('/photo', profile.uploadProfilePhoto);
router.delete('/photo', profile.removeProfilePhoto);
router.get('/:userId', validate({ params: userIdParams }), profile.getProfileByUserId);

module.exports = router;
