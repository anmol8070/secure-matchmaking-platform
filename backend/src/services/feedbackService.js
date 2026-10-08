/**
 * Phase 8 Interaction Feedback & Tracking Service.
 *
 * Records user interactions (profile view, interest/like, connection request,
 * connection accepted, rejection, feedback) in the `activity_feedback` table.
 *
 * DB constraint `chk_activity_feedback_action` allows exactly these action values:
 *   'profile_view' | 'interest' | 'connection_request' | 'connection_accepted' | 'rejection' | 'feedback'
 *
 * The service also feeds positive/negative samples into the Logistic Regression
 * engine for Phase 9 ML preparation (trainStep is called but not used for ranking
 * in Phase 8 — it prepares weight state for Phase 9).
 */

const { ActivityFeedback, Profile, UserHobby, QuizAnswer } = require('../models');
const { defaultEngine } = require('./ml/logisticRegressionEngine');
const matchingService = require('./matchingService');
const ApiError = require('../utils/ApiError');

/**
 * Canonical action values accepted by the DB CHECK constraint.
 * These are the only strings safe to insert into activity_feedback.action.
 */
const DB_ACTIONS = Object.freeze({
  PROFILE_VIEW: 'profile_view',
  INTEREST: 'interest',
  CONNECTION_REQUEST: 'connection_request',
  CONNECTION_ACCEPTED: 'connection_accepted',
  REJECTION: 'rejection',
  FEEDBACK: 'feedback',
});

/**
 * API-facing action names accepted by the /feedback endpoint.
 * Maps to the DB-canonical values above.
 */
const API_TO_DB_ACTION = Object.freeze({
  profile_view: DB_ACTIONS.PROFILE_VIEW,
  interest: DB_ACTIONS.INTEREST,
  // Legacy alias kept for backward compatibility with existing frontend & tests
  like: DB_ACTIONS.INTEREST,
  connection_request: DB_ACTIONS.CONNECTION_REQUEST,
  connection_accepted: DB_ACTIONS.CONNECTION_ACCEPTED,
  // Legacy aliases
  accepted: DB_ACTIONS.CONNECTION_ACCEPTED,
  rejection: DB_ACTIONS.REJECTION,
  rejected: DB_ACTIONS.REJECTION,
  feedback: DB_ACTIONS.FEEDBACK,
});

const VALID_API_ACTIONS = new Set(Object.keys(API_TO_DB_ACTION));

/** Actions that represent positive user intent (for ML training labels). */
const POSITIVE_DB_ACTIONS = new Set([
  DB_ACTIONS.INTEREST,
  DB_ACTIONS.CONNECTION_REQUEST,
  DB_ACTIONS.CONNECTION_ACCEPTED,
]);

/** Actions that represent negative user intent (for ML training labels). */
const NEGATIVE_DB_ACTIONS = new Set([DB_ACTIONS.REJECTION]);

/**
 * Extracts a normalized feature vector for a user/candidate pair.
 * Used by the ML engine training step (Phase 9 preparation).
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
    // Fallback to neutral defaults on calculation failure
  }

  const [userStats, targetStats, candidateProfile] = await Promise.all([
    ActivityFeedback.getUserStats(userId, trx),
    ActivityFeedback.getTargetStats(targetUserId, trx),
    Profile.findByPk(targetUserId, trx),
  ]);

  let recencyScore = 0.5;
  if (candidateProfile?.created_at) {
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

/**
 * Records a user interaction event.
 *
 * @param {number} userId       Authenticated user performing the action.
 * @param {object} body         { targetUserId?, action, reason? }
 * @param {*}      [trx]        Optional Knex transaction.
 */
async function recordFeedback(userId, { targetUserId, action, reason }, trx) {
  if (!VALID_API_ACTIONS.has(action)) {
    throw ApiError.badRequest(`Invalid action type '${action}'`);
  }

  if (targetUserId && Number(userId) === Number(targetUserId)) {
    throw ApiError.badRequest('Cannot record feedback on yourself');
  }

  const dbAction = API_TO_DB_ACTION[action];

  const id = await ActivityFeedback.logFeedback(
    { userId, targetUserId, action: dbAction, reason },
    trx
  );

  let mlUpdate = null;

  // Trigger online ML SGD training step for explicit positive/negative actions
  if (targetUserId && (POSITIVE_DB_ACTIONS.has(dbAction) || NEGATIVE_DB_ACTIONS.has(dbAction))) {
    try {
      const features = await extractFeatures(userId, targetUserId, trx);
      const isPositive = POSITIVE_DB_ACTIONS.has(dbAction);
      mlUpdate = defaultEngine.trainStep(features, isPositive ? 1 : 0);
    } catch {
      // Non-critical; ML training failure must not block interaction recording
    }
  }

  return {
    id,
    userId,
    targetUserId,
    action: dbAction,
    reason,
    mlUpdate: mlUpdate ? { prediction: mlUpdate.prediction, error: mlUpdate.error } : null,
  };
}

/**
 * Lightweight interaction event recorder for internal use (e.g. profile_view on
 * GET /matches/:userId). Silently ignores errors so callers can fire-and-forget.
 *
 * Only inserts when targetUserId is provided and differs from userId.
 *
 * @param {number} userId
 * @param {number} targetUserId
 * @param {string} action        One of the API_TO_DB_ACTION keys.
 * @param {*}      [trx]
 */
async function recordInteractionEvent(userId, targetUserId, action, trx) {
  if (!userId || !targetUserId || Number(userId) === Number(targetUserId)) return;
  if (!VALID_API_ACTIONS.has(action)) return;
  try {
    const dbAction = API_TO_DB_ACTION[action];
    await ActivityFeedback.logFeedback({ userId, targetUserId, action: dbAction, reason: null }, trx);
  } catch {
    // Interaction logging is best-effort; errors are intentionally swallowed
  }
}

async function listOwnActivity(userId, { page = 1, limit = 50 } = {}, trx) {
  const offset = (page - 1) * limit;
  const activity = await ActivityFeedback.getUserActivity(userId, limit, offset, trx);
  return { activity, page, limit };
}

module.exports = {
  recordFeedback,
  recordInteractionEvent,
  listOwnActivity,
  extractFeatures,
  API_TO_DB_ACTION,
  DB_ACTIONS,
  VALID_API_ACTIONS,
};
