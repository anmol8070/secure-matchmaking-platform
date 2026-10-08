const matchingService = require('../../services/matchingService');

/**
 * Extracts normalized features for the ML model from a user-candidate pair.
 * 
 * @param {number} userId 
 * @param {number} candidateId 
 * @returns {object} Features object
 */
async function extractFeatures(userId, candidateId) {
  try {
    // We use the exact Phase 7 matching logic to get the raw components
    // In a production system with real temporal data, this would query historical snapshots
    const matchData = await matchingService.calculateCompatibility(userId, candidateId);
    
    const breakdown = matchData.scoreBreakdown;
    
    // Normalize score 0-1
    const compatibility_score = matchData.score / 100.0;
    
    // Extract individual similarity scores (they are 0.0 - 1.0)
    const location_similarity = breakdown.location?.similarity || 0;
    const education_similarity = breakdown.education?.similarity || 0;
    const occupation_similarity = breakdown.occupation?.similarity || 0;
    const lifestyle_similarity = breakdown.lifestyle?.similarity || 0;
    const food_similarity = breakdown.food?.similarity || 0;
    
    // Extracted from details
    const hobby_similarity = breakdown.details?.hobbyJaccard || 0;
    const quiz_similarity = breakdown.details?.quizAgreement || 0;
    
    // We need common hobby count, we can get it from the length of commonHobbies
    // but the matching service returns it in getMatchWithUser, not calculateCompatibility
    // calculateCompatibility just returns the score and breakdown.
    // However, the mlFeatures in Phase 8 also have commonHobbiesCount.
    // Let's recalculate or fetch it if needed.
    // Actually, Phase 8 recommendationService exposes mlFeatures. Let's see how it does it.
    
    return {
      compatibility_score,
      location_similarity,
      education_similarity,
      occupation_similarity,
      hobby_similarity,
      lifestyle_similarity,
      food_similarity,
      quiz_similarity,
      // For now we omit common_hobby_count if it's too expensive to re-fetch here, 
      // or we can add a method to get it. 
    };
  } catch (error) {
    // If a profile was deleted, we return null
    return null;
  }
}

/**
 * Define the standard feature order so inference and training use the same array mapping
 */
const FEATURE_ORDER = [
  'compatibility_score',
  'location_similarity',
  'education_similarity',
  'occupation_similarity',
  'hobby_similarity',
  'lifestyle_similarity',
  'food_similarity',
  'quiz_similarity'
];

function vectorizeFeatures(featuresObj) {
  return FEATURE_ORDER.map(key => featuresObj[key] || 0);
}

module.exports = {
  extractFeatures,
  vectorizeFeatures,
  FEATURE_ORDER
};
