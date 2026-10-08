/**
 * /api/v1/matches — Phase 8 match ranking & recommended profiles.
 *
 * GET /api/v1/matches         Paginated, deterministically-ranked recommendations.
 * GET /api/v1/matches/:userId Full compatibility details for a specific candidate.
 *
 * Authentication is enforced by requireAuth in routes.js (applied to all
 * PROTECTED_MODULES). These routes must never be reachable without a valid token.
 */
const { Router } = require('express');
const matches = require('../controllers/matchController');
const { validate, z, id, userIdParams, paginationQuery } = require('../validators/commonValidator');

const router = Router();

/**
 * Extended pagination + optional filter query for GET /matches.
 * Filters do not alter the compatibility formula — they narrow the candidate
 * pool before ranking.
 */
const matchQuerySchema = paginationQuery.extend({
  location: z.string().trim().max(100).optional(),
  minAge: z.coerce.number().int().min(18).max(120).optional(),
  maxAge: z.coerce.number().int().min(18).max(120).optional(),
  education: z.string().trim().max(150).optional(),
  occupation: z.string().trim().max(150).optional(),
  lifestyle: z.string().trim().max(100).optional(),
});

// GET /api/v1/matches
router.get('/', validate({ query: matchQuerySchema }), matches.getMatches);

// GET /api/v1/matches/:userId
router.get('/:userId', validate({ params: userIdParams }), matches.getMatchWithUser);

module.exports = router;
