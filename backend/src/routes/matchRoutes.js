/**
 * /api/v1/matches — compatibility results for the current user.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const matches = require('../controllers/matchController');
const { validate, userIdParams } = require('../validators/commonValidator');

const router = Router();

router.get('/', matches.getMatches);
router.get('/:userId', validate({ params: userIdParams }), matches.getMatchWithUser);

module.exports = router;
