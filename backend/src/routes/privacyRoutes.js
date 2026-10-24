/**
 * /api/v1/privacy — the authenticated user's own privacy settings (Phase 13).
 * Protected by requireAuth (routes.js).
 */
const { Router } = require('express');
const privacy = require('../controllers/privacyController');
const { validate } = require('../validators/commonValidator');
const { updatePrivacyBody } = require('../validators/privacyValidator');

const router = Router();

router.get('/settings', privacy.getSettings);
router.put('/settings', validate({ body: updatePrivacyBody }), privacy.updateSettings);

module.exports = router;
