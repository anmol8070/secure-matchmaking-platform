/**
 * /api/v1/hobbies — the hobby catalogue (active hobbies). Requires
 * authentication (mounted behind requireAuth). The user's own selection lives
 * under /api/v1/preferences/hobbies.
 */
const { Router } = require('express');
const hobbies = require('../controllers/hobbyController');

const router = Router();

router.get('/', hobbies.listHobbies);

module.exports = router;
