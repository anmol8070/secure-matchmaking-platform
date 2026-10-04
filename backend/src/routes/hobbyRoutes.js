/**
 * /api/v1/hobbies — hobby catalogue and the current user's hobbies.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const hobbies = require('../controllers/hobbyController');

const router = Router();

router.get('/', hobbies.listHobbies);
router.get('/me', hobbies.getMyHobbies);
router.put('/me', hobbies.setMyHobbies);

module.exports = router;
