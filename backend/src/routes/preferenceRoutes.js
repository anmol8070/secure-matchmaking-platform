/**
 * /api/v1/preferences — the current user's preferences.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const preferences = require('../controllers/preferenceController');

const router = Router();

router.get('/', preferences.getPreferences);
router.put('/', preferences.updatePreferences);

module.exports = router;
