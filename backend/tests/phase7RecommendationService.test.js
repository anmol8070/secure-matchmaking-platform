const recommendationService = require('../src/services/recommendationService');
const { Profile, Block } = require('../src/models');
const matchingService = require('../src/services/matchingService');
const feedbackService = require('../src/services/feedbackService');

jest.mock('../src/models/profileModel');
jest.mock('../src/models/blockModel');
jest.mock('../src/services/matchingService');
jest.mock('../src/services/feedbackService');

describe('recommendationService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters out blocked users and ranks candidates by adaptive score', async () => {
    Block.getBlockedUserIds.mockResolvedValue([3]); // User 3 is blocked

    Profile.getEligibleCandidates.mockResolvedValue([
      {
        user_id: 2,
        name: 'Alice',
        city: 'San Francisco',
        date_of_birth: '1996-01-01',
      },
      {
        user_id: 4,
        name: 'Bob',
        city: 'San Jose',
        date_of_birth: '1994-05-05',
      },
    ]);

    matchingService.calculateCompatibility.mockImplementation(async (userId, targetId) => {
      if (targetId === 2) {
        return {
          score: 85,
          scoreBreakdown: { locationAndAge: 20, preferencesAndLifestyle: 20, hobbyOverlap: 22.5, quizSimilarity: 22.5 },
        };
      }
      return {
        score: 60,
        scoreBreakdown: { locationAndAge: 15, preferencesAndLifestyle: 15, hobbyOverlap: 15, quizSimilarity: 15 },
      };
    });

    feedbackService.extractFeatures.mockImplementation(async (userId, targetId) => ({
      compatibilityScore: targetId === 2 ? 0.85 : 0.6,
      demographicScore: 0.8,
      lifestyleScore: 0.8,
      hobbyJaccard: 0.5,
      quizSimilarity: 0.5,
      viewerCTR: 0.5,
      candidatePopularity: 0.5,
      recencyScore: 0.8,
    }));

    const result = await recommendationService.getRecommendations(1, { page: 1, limit: 10 });

    expect(Block.getBlockedUserIds).toHaveBeenCalledWith(1, undefined);
    expect(Profile.getEligibleCandidates).toHaveBeenCalledWith(1, [3], undefined);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].candidateId).toBe(2);
    expect(result.recommendations[0].profile.name).toBe('Alice');
    expect(result.recommendations[0].adaptiveRankScore).toBeGreaterThan(result.recommendations[1].adaptiveRankScore);
  });

  it('returns empty array when no eligible candidates exist', async () => {
    Block.getBlockedUserIds.mockResolvedValue([]);
    Profile.getEligibleCandidates.mockResolvedValue([]);

    const result = await recommendationService.getRecommendations(1);
    expect(result.recommendations).toEqual([]);
    expect(result.total).toBe(0);
  });
});
