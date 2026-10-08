/**
 * Match & Recommendation endpoints (Phase 8).
 * HTTP only — logic lives in services/recommendationService.js & services/matchingService.js.
 */
const recommendationService = require('../services/recommendationService');
const matchingService = require('../services/matchingService');
const { sendSuccess } = require('../utils/apiResponse');

async function getMatches(req, res) {
  const result = await recommendationService.getRecommendations(req.auth.userId, req.validated.query);
  sendSuccess(res, { data: result });
}

async function getMatchWithUser(req, res) {
  const targetUserId = req.validated.params.userId;
  const result = await matchingService.getMatchWithUser(req.auth.userId, targetUserId);
  sendSuccess(res, { data: result });
}

module.exports = {
  getMatches,
  getMatchWithUser,
};
