/**
 * Phase 7/8 recommendationService backward-compatibility tests.
 *
 * These tests verify the core recommendation pipeline continues to work
 * after Phase 8 changes:
 *   - block filtering via Block.getBlockedUserIds
 *   - eligible candidate retrieval via Profile.getEligibleCandidates
 *   - Phase 7 compatibility score ranking
 *   - empty list when no candidates exist
 *
 * Note: Phase 8 changed the response key from `candidateId` to `userId` (which
 * is the canonical name used across the API) and removed `adaptiveRankScore`
 * (ML ranking is Phase 9). Tests updated accordingly.
 */
const recommendationService = require('../src/services/recommendationService');
const { Profile, Block } = require('../src/models');
const matchingService = require('../src/services/matchingService');

jest.mock('../src/models/profileModel');
jest.mock('../src/models/blockModel');
jest.mock('../src/services/matchingService');

describe('recommendationService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters out blocked users and ranks candidates by compatibility score DESC', async () => {
    Block.getBlockedUserIds.mockResolvedValue([3]); // User 3 is blocked

    Profile.getEligibleCandidates.mockResolvedValue([
      { user_id: 2, name: 'Alice', city: 'San Francisco', date_of_birth: '1996-01-01' },
      { user_id: 4, name: 'Bob', city: 'San Jose', date_of_birth: '1994-05-05' },
    ]);

    matchingService.calculateCompatibility.mockImplementation(async (userId, targetId) => {
      const scores = {
        2: { score: 85, commonHobbies: [], whyThisMatch: [], scoreBreakdown: { locationAndAge: 20, preferencesAndLifestyle: 20, hobbyOverlap: 22.5, quizSimilarity: 22.5, details: {} } },
        4: { score: 60, commonHobbies: [], whyThisMatch: [], scoreBreakdown: { locationAndAge: 15, preferencesAndLifestyle: 15, hobbyOverlap: 15, quizSimilarity: 15, details: {} } },
      };
      return scores[targetId] || { score: 0, commonHobbies: [], whyThisMatch: [], scoreBreakdown: {} };
    });

    const result = await recommendationService.getRecommendations(1, { page: 1, limit: 10 });

    expect(Block.getBlockedUserIds).toHaveBeenCalledWith(1, undefined);
    expect(Profile.getEligibleCandidates).toHaveBeenCalledWith(1, [3], undefined);
    expect(result.recommendations).toHaveLength(2);

    // Phase 8: key is `userId` (not `candidateId`)
    expect(result.recommendations[0].userId).toBe(2);
    expect(result.recommendations[0].profile.name).toBe('Alice');
    expect(result.recommendations[0].compatibilityScore).toBeGreaterThan(
      result.recommendations[1].compatibilityScore
    );
  });

  it('returns empty array and total=0 when no eligible candidates exist', async () => {
    Block.getBlockedUserIds.mockResolvedValue([]);
    Profile.getEligibleCandidates.mockResolvedValue([]);

    const result = await recommendationService.getRecommendations(1);

    expect(result.recommendations).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});
