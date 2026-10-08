/**
 * Recommendation endpoints (Phase 8).
 * HTTP only — logic lives in services/recommendationService.js.
 */
const recommendationService = require('../services/recommendationService');
const { sendSuccess } = require('../utils/apiResponse');

async function getRecommendations(req, res) {
  const result = await recommendationService.getRecommendations(req.auth.userId, req.validated.query);
  sendSuccess(res, { data: result });
}

module.exports = {
  getRecommendations,
};
