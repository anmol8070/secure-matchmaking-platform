/**
 * Phase 7 Interaction Feedback & Tracking Service.
 *
 * Records user interactions (profile view, like, connection request, accept, reject, feedback)
 * in `activity_feedback` and feeds positive/negative samples into the Logistic Regression engine.
 */

const { ActivityFeedback, Profile, UserHobby, QuizAnswer } = require('../models');
const { defaultEngine } = require('./ml/logisticRegressionEngine');
const matchingService = require('./matchingService');
const ApiError = require('../utils/ApiError');

const VALID_ACTIONS = new Set([
  'profile_view',
  'like',
  'connection_request',
  'accepted',
  'rejected',
  'feedback',
]);

const POSITIVE_ACTIONS = new Set(['like', 'connection_request', 'accepted']);
const NEGATIVE_ACTIONS = new Set(['rejected']);

/**
 * Extracts normalized feature object for a pair (userId, targetUserId).
 */
async function extractFeatures(userId, targetUserId, trx) {
  let compatibilityScore = 0.5;
  let demographicScore = 0.5;
  let lifestyleScore = 0.5;
  let hobbyJaccard = 0.5;
  let quizSimilarity = 0.5;

  try {
    const comp = await matchingService.calculateCompatibility(userId, targetUserId, trx);
    compatibilityScore = comp.score / 100;
    demographicScore = comp.scoreBreakdown.locationAndAge / 25;
    lifestyleScore = comp.scoreBreakdown.preferencesAndLifestyle / 25;
    hobbyJaccard = comp.scoreBreakdown.details?.hobbyJaccard ?? 0.5;
    quizSimilarity = comp.scoreBreakdown.details?.quizAgreement ?? 0.5;
  } catch {
    // Fallback defaults if calculation fails
  }

  const [userStats, targetStats, candidateProfile] = await Promise.all([
    ActivityFeedback.getUserStats(userId, trx),
    ActivityFeedback.getTargetStats(targetUserId, trx),
    Profile.findByPk(targetUserId, trx),
  ]);

  let recencyScore = 0.5;
  if (candidateProfile && candidateProfile.created_at) {
    const daysOld = (Date.now() - new Date(candidateProfile.created_at).getTime()) / (1000 * 3600 * 24);
    recencyScore = Math.exp(-daysOld / 30);
  }

  return {
    compatibilityScore,
    demographicScore,
    lifestyleScore,
    hobbyJaccard,
    quizSimilarity,
    viewerCTR: userStats.ctr,
    candidatePopularity: targetStats.popularity,
    recencyScore,
  };
}

async function recordFeedback(userId, { targetUserId, action, reason }, trx) {
  if (!VALID_ACTIONS.has(action)) {
    throw ApiError.badRequest(`Invalid action type '${action}'`);
  }

  if (targetUserId && Number(userId) === Number(targetUserId)) {
    throw ApiError.badRequest('Cannot record feedback on yourself');
  }

  const id = await ActivityFeedback.logFeedback(
    {
      userId,
      targetUserId,
      action,
      reason,
    },
    trx
  );

  let mlUpdate = null;

  // Trigger online ML SGD training step if targetUserId is given and action is explicit
  if (targetUserId && (POSITIVE_ACTIONS.has(action) || NEGATIVE_ACTIONS.has(action))) {
    try {
      const features = await extractFeatures(userId, targetUserId, trx);
      const isPositive = POSITIVE_ACTIONS.has(action);
      mlUpdate = defaultEngine.trainStep(features, isPositive ? 1 : 0);
    } catch (err) {
      // Log error silently without failing feedback recording
    }
  }

  return {
    id,
    userId,
    targetUserId,
    action,
    reason,
    mlUpdate: mlUpdate
      ? { prediction: mlUpdate.prediction, error: mlUpdate.error }
      : null,
  };
}

async function listOwnActivity(userId, { page = 1, limit = 50 } = {}, trx) {
  const offset = (page - 1) * limit;
  const activity = await ActivityFeedback.getUserActivity(userId, limit, offset, trx);
  return {
    activity,
    page,
    limit,
  };
}

module.exports = {
  recordFeedback,
  listOwnActivity,
  extractFeatures,
};
