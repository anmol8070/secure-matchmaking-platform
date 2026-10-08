/**
 * Phase 8 — Match Ranking & Recommended Profiles.
 *
 * Deterministic recommendation pipeline:
 *   1. Load eligible active candidate profiles.
 *   2. Exclude self + blocked users (both directions).
 *   3. Calculate Phase 7 compatibility scores via matchingService.
 *   4. Sort deterministically: compatibilityScore DESC → candidateId ASC.
 *   5. Paginate and return top-K recommendations.
 *
 * NOTE: No ML ranking in Phase 8. ML-based adaptive ranking is reserved for Phase 9.
 * NOTE: The Phase 7 compatibility formula is the sole ranking baseline here.
 */

const { Profile, Block } = require('../models');
const matchingService = require('./matchingService');
const mlInferenceService = require('../ml/inference/mlInferenceService');
const { toPublicUrl } = require('./storage');
const { ageFromDateOfBirth } = require('../utils/age');
const ApiError = require('../utils/ApiError');
const config = require('../config/environment');

/**
 * Weights for combining ML and deterministic scores (α + β = 1.0)
 */
const ML_WEIGHT = 0.60;
const COMPATIBILITY_WEIGHT = 0.40;

/**
 * Default and maximum page sizes for recommendations.
 * Configured via RECOMMENDATION_DEFAULT_LIMIT / RECOMMENDATION_MAX_LIMIT environment variables.
 */
const RECOMMENDATION_DEFAULT_LIMIT = config.recommendation.defaultLimit;
const RECOMMENDATION_MAX_LIMIT = config.recommendation.maxLimit;

/**
 * Formats a candidate profile row into the public-facing profile object.
 * Sensitive or private fields are never included.
 */
function formatCandidateProfile(candidate) {
  return {
    name: candidate.name || null,
    age: ageFromDateOfBirth(candidate.date_of_birth),
    gender: candidate.gender || null,
    location: [candidate.city, candidate.state, candidate.country].filter(Boolean).join(', ') || null,
    education: candidate.education || null,
    occupation: candidate.occupation || null,
    lifestyle: candidate.lifestyle || null,
    bio: candidate.bio || null,
    profilePicture: toPublicUrl(candidate.profile_photo_url),
  };
}

/**
 * Returns paginated, deterministically-ranked recommendations for `userId`.
 *
 * Eligibility filtering (self + blocks in both directions) is delegated to the
 * profile model so it happens in one DB query.
 *
 * Each candidate's Phase 7 compatibility result is calculated (or retrieved from
 * the cached `matches` row) via matchingService.calculateCompatibility, which
 * also upserts the result for future retrieval and Phase 9 ML feature extraction.
 *
 * @param {number} userId          The authenticated requesting user.
 * @param {object} [options]       Pagination + optional filter options:
 *                                 { page, limit, location, minAge, maxAge, education, occupation, lifestyle }.
 * @param {*}      [trx]           Optional Knex transaction.
 * @returns {object}               { recommendations, pagination }
 */
async function getRecommendations(userId, options = {}, trx) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const rawLimit = parseInt(options.limit || RECOMMENDATION_DEFAULT_LIMIT, 10);
  const limit = Math.min(RECOMMENDATION_MAX_LIMIT, Math.max(1, isNaN(rawLimit) ? RECOMMENDATION_DEFAULT_LIMIT : rawLimit));

  // 1. Fetch all blocked user IDs (users blocked by me + users who blocked me)
  const blockedUserIds = await Block.getBlockedUserIds(userId, trx);

  // 2. Fetch eligible active candidate profiles (excludes self + blocked)
  let candidateProfiles = await Profile.getEligibleCandidates(userId, blockedUserIds, trx);

  // 2a. Apply optional client-requested filters to narrow the candidate pool.
  //     Filters do NOT change the Phase 7 compatibility formula — they only
  //     reduce which candidates are scored and ranked.
  const { location, minAge, maxAge, education, occupation, lifestyle } = options;

  if (location) {
    const loc = location.toLowerCase();
    candidateProfiles = candidateProfiles.filter(
      (c) =>
        (c.city && c.city.toLowerCase().includes(loc)) ||
        (c.state && c.state.toLowerCase().includes(loc)) ||
        (c.country && c.country.toLowerCase().includes(loc))
    );
  }
  if (minAge !== undefined || maxAge !== undefined) {
    candidateProfiles = candidateProfiles.filter((c) => {
      const age = ageFromDateOfBirth(c.date_of_birth);
      if (age === null) return true; // include profiles without DOB
      if (minAge !== undefined && age < minAge) return false;
      if (maxAge !== undefined && age > maxAge) return false;
      return true;
    });
  }
  if (education) {
    const edu = education.toLowerCase();
    candidateProfiles = candidateProfiles.filter(
      (c) => c.education && c.education.toLowerCase().includes(edu)
    );
  }
  if (occupation) {
    const occ = occupation.toLowerCase();
    candidateProfiles = candidateProfiles.filter(
      (c) => c.occupation && c.occupation.toLowerCase().includes(occ)
    );
  }
  if (lifestyle) {
    const ls = lifestyle.toLowerCase();
    candidateProfiles = candidateProfiles.filter(
      (c) => c.lifestyle && c.lifestyle.toLowerCase().includes(ls)
    );
  }

  if (!candidateProfiles.length) {
    return {
      recommendations: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  // 3. Compute Phase 7 compatibility for every candidate
  //    calculateCompatibility also upserts the result to `matches` for Phase 9
  const candidateScores = await Promise.all(
    candidateProfiles.map(async (candidate) => {
      const candidateId = candidate.user_id;
      try {
        const comp = await matchingService.calculateCompatibility(userId, candidateId, trx);
        // Phase 9 ML feature vector — pre-computed and ready for training
        const mlFeatures = {
          compatibility_score: comp.score / 100,
          location_similarity: comp.scoreBreakdown.location?.similarity ?? 0,
          education_similarity: comp.scoreBreakdown.education?.similarity ?? 0,
          occupation_similarity: comp.scoreBreakdown.occupation?.similarity ?? 0,
          hobby_similarity: comp.scoreBreakdown.details?.hobbyJaccard ?? 0,
          lifestyle_similarity: comp.scoreBreakdown.lifestyle?.similarity ?? 0,
          food_similarity: comp.scoreBreakdown.food?.similarity ?? 0,
          quiz_similarity: comp.scoreBreakdown.details?.quizAgreement ?? 0,
        };
          
          // Phase 9: ML Prediction and Adaptive Score Combination
          let mlPrediction = await mlInferenceService.predictCandidateProbability(userId, candidateId, mlFeatures);
          let recommendationScore = comp.score; // Fallback to raw compatibility if ML unavailable (cold start)
          
          if (mlPrediction !== null) {
            recommendationScore = (COMPATIBILITY_WEIGHT * comp.score) + (ML_WEIGHT * mlPrediction * 100);
          }

          return {
            userId: candidateId,
            profile: formatCandidateProfile(candidate),
            compatibilityScore: comp.score,
            mlPrediction,
            recommendationScore,
            commonHobbies: comp.commonHobbies,
            whyThisMatch: comp.whyThisMatch,
            scoreBreakdown: comp.scoreBreakdown,
            mlFeatures,
          };
      } catch {
        // Skip candidates for which compatibility calculation fails
        return null;
      }
    })
  );

  // Filter out any null entries (failed compatibility calculations)
  const scored = candidateScores.filter(Boolean);

  // 4. Adaptive Ranking: recommendationScore DESC, then candidateId ASC (stable tiebreak)
  scored.sort((a, b) => {
    if (b.recommendationScore !== a.recommendationScore) {
      return b.recommendationScore - a.recommendationScore;
    }
    return a.userId - b.userId;
  });

  // 5. Paginate
  const total = scored.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginated = scored.slice(offset, offset + limit);

  return {
    recommendations: paginated,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Returns the full match details between the requesting user and a specific candidate.
 *
 * Performs:
 *   - Self-check (cannot view match with yourself)
 *   - Block check (cannot view match with a blocked / blocking user)
 *   - Active status check (candidate must have an active account)
 *   - Phase 7 compatibility calculation (or retrieval from cache)
 *
 * @param {number} userId         The authenticated requesting user.
 * @param {number} targetUserId   The candidate whose details are being requested.
 * @param {*}      [trx]          Optional Knex transaction.
 */
async function getMatchDetails(userId, targetUserId, trx) {
  if (Number(userId) === Number(targetUserId)) {
    throw ApiError.badRequest('Cannot view a match with yourself');
  }

  // Block check (bidirectional)
  const isBlocked = await Block.isBlocked(userId, targetUserId, trx);
  if (isBlocked) {
    throw ApiError.forbidden('This profile is not accessible');
  }

  // Fetch candidate profile (also confirms candidate has a profile and an active account)
  const candidate = await Profile.getActiveProfileById(targetUserId, trx);
  if (!candidate) {
    throw ApiError.notFound('Profile not found or account is inactive');
  }

  // Phase 7 compatibility — stores/updates the result in `matches`
  const comp = await matchingService.calculateCompatibility(userId, targetUserId, trx);

  const mlFeatures = {
    compatibility_score: comp.score / 100,
    location_similarity: comp.scoreBreakdown.location?.similarity ?? 0,
    education_similarity: comp.scoreBreakdown.education?.similarity ?? 0,
    occupation_similarity: comp.scoreBreakdown.occupation?.similarity ?? 0,
    hobby_similarity: comp.scoreBreakdown.details?.hobbyJaccard ?? 0,
    lifestyle_similarity: comp.scoreBreakdown.lifestyle?.similarity ?? 0,
    food_similarity: comp.scoreBreakdown.food?.similarity ?? 0,
    quiz_similarity: comp.scoreBreakdown.details?.quizAgreement ?? 0,
  };

  let mlPrediction = await mlInferenceService.predictCandidateProbability(userId, targetUserId, mlFeatures);
  let recommendationScore = comp.score;
  
  if (mlPrediction !== null) {
    recommendationScore = (COMPATIBILITY_WEIGHT * comp.score) + (ML_WEIGHT * mlPrediction * 100);
  }

  return {
    userId: targetUserId,
    profile: formatCandidateProfile(candidate),
    compatibilityScore: comp.score,
    mlPrediction,
    recommendationScore,
    commonHobbies: comp.commonHobbies,
    whyThisMatch: comp.whyThisMatch,
    scoreBreakdown: comp.scoreBreakdown,
    mlFeatures,
  };
}

module.exports = {
  getRecommendations,
  getMatchDetails,
  RECOMMENDATION_DEFAULT_LIMIT,
  RECOMMENDATION_MAX_LIMIT,
};
