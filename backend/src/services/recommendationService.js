/**
 * Phase 8 Match Ranking & Recommendation Service.
 *
 * Implements deterministic recommendation pipeline using Phase 7 Compatibility Engine.
 * Loads eligible candidates (active status, excluding self & blocks), calculates Phase 7
 * compatibility scores, sorts deterministically (compatibilityScore DESC, candidateId ASC),
 * and formats paginated response with data-driven explainability ("Why this match?").
 *
 * NOTE: ML prediction is strictly prohibited in Phase 8 and reserved for Phase 9.
 */

const { Profile, Block } = require('../models');
const matchingService = require('./matchingService');
const ApiError = require('../utils/ApiError');

const RECOMMENDATION_DEFAULT_LIMIT = 20;
const RECOMMENDATION_MAX_LIMIT = 100;

/**
 * Calculates candidate age from date_of_birth.
 */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Ranks eligible candidates deterministically by Phase 7 compatibility score.
 */
async function getRecommendations(userId, options = {}, trx) {
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const rawLimit = parseInt(options.limit || RECOMMENDATION_DEFAULT_LIMIT, 10);
  const limit = Math.min(RECOMMENDATION_MAX_LIMIT, Math.max(1, rawLimit));

  // 1. Fetch blocked user IDs (blocker or blocked)
  const blockedUserIds = await Block.getBlockedUserIds(userId, trx);

  // 2. Fetch eligible active candidate profiles
  const candidateProfiles = await Profile.getEligibleCandidates(userId, blockedUserIds, trx);

  if (!candidateProfiles.length) {
    return {
      recommendations: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  // 3. Compute/retrieve Phase 7 compatibility score & breakdown for each candidate
  const candidateScores = await Promise.all(
    candidateProfiles.map(async (candidate) => {
      const candidateId = candidate.user_id;
      const comp = await matchingService.calculateCompatibility(userId, candidateId, trx);

      const locationStr = [candidate.city, candidate.state, candidate.country]
        .filter(Boolean)
        .join(', ');

      return {
        userId: candidateId,
        profile: {
          name: candidate.name,
          age: calculateAge(candidate.date_of_birth),
          location: locationStr,
          education: candidate.education,
          occupation: candidate.occupation,
          lifestyle: candidate.lifestyle,
          bio: candidate.bio,
          profilePicture: candidate.profile_photo_url,
        },
        compatibilityScore: comp.score,
        commonHobbies: comp.commonHobbies,
        whyThisMatch: comp.whyThisMatch,
        scoreBreakdown: comp.scoreBreakdown,
      };
    })
  );

  // 4. Deterministic sorting: compatibilityScore DESC, tie-break by userId ASC
  candidateScores.sort((a, b) => {
    if (b.compatibilityScore !== a.compatibilityScore) {
      return b.compatibilityScore - a.compatibilityScore;
    }
    return a.userId - b.userId;
  });

  // 5. Paginate recommendations
  const total = candidateScores.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginated = candidateScores.slice(offset, offset + limit);

  return {
    recommendations: paginated,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

module.exports = {
  getRecommendations,
  RECOMMENDATION_DEFAULT_LIMIT,
  RECOMMENDATION_MAX_LIMIT,
};
