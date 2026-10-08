/**
 * Match & Recommendation endpoints (Phase 8).
 *
 * HTTP layer only — all business logic lives in:
 *   - services/recommendationService.js   (candidate selection, ranking, match details)
 *   - services/matchingService.js          (Phase 7 compatibility calculation)
 *   - services/feedbackService.js          (interaction event logging for Phase 9 ML)
 *
 * Routes are protected by requireAuth (applied in routes.js).
 */
const recommendationService = require('../services/recommendationService');
const feedbackService = require('../services/feedbackService');
const { sendSuccess } = require('../utils/apiResponse');

/**
 * GET /api/v1/matches
 *
 * Returns a paginated list of recommended candidates ranked deterministically
 * by Phase 7 compatibility score (highest → lowest).
 */
async function getMatches(req, res) {
  const result = await recommendationService.getRecommendations(
    req.auth.userId,
    req.validated.query
  );
  sendSuccess(res, { data: result });
}

/**
 * GET /api/v1/matches/:userId
 *
 * Returns full compatibility details for a specific candidate.
 * Also records a profile_view interaction event for Phase 9 ML feature collection.
 */
async function getMatchWithUser(req, res) {
  const targetUserId = req.validated.params.userId;

  // Log profile_view interaction for Phase 9 ML feature collection (non-blocking)
  feedbackService
    .recordInteractionEvent(req.auth.userId, targetUserId, 'profile_view')
    .catch(() => {});

  const result = await recommendationService.getMatchDetails(req.auth.userId, targetUserId);
  sendSuccess(res, { data: result });
}

module.exports = {
  getMatches,
  getMatchWithUser,
};
