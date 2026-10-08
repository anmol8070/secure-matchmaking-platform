/**
 * /api/v1/matches — compatibility results for the current user.
 */
const { Router } = require('express');
const matches = require('../controllers/matchController');
const { validate, userIdParams, paginationQuery } = require('../validators/commonValidator');

const router = Router();

router.get('/', validate({ query: paginationQuery }), matches.getMatches);
router.get('/:userId', validate({ params: userIdParams }), matches.getMatchWithUser);

module.exports = router;
