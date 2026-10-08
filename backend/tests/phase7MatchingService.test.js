const matchingService = require('../src/services/matchingService');
const { Profile, Preference, UserHobby, QuizAnswer, Match } = require('../src/models');

jest.mock('../src/models/profileModel');
jest.mock('../src/models/preferenceModel');
jest.mock('../src/models/userHobbyModel');
jest.mock('../src/models/quizAnswerModel');
jest.mock('../src/models/matchModel');

describe('matchingService Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Match.upsertMatch.mockResolvedValue(1);
  });

  it('calculates full compatibility score for identical profiles', async () => {
    Profile.findByPk.mockImplementation(async (id) => ({
      user_id: id,
      name: `User ${id}`,
      city: 'New York',
      state: 'NY',
      country: 'USA',
      date_of_birth: '1995-05-15',
      education: 'Master of Science',
      occupation: 'Software Engineer',
      lifestyle: 'Active',
    }));

    Preference.findByPk.mockResolvedValue({
      user_id: 1,
      food_preference: 'Active',
      lifestyle_preference: 'Active',
      preferred_location: 'New York',
      preferred_education: 'Master',
      preferred_occupation: 'Engineer',
      partner_min_age: 20,
      partner_max_age: 35,
    });

    UserHobby.getUserHobbyIds.mockResolvedValue([1, 2, 3, 4]);
    QuizAnswer.getUserAnswers.mockResolvedValue([
      { question_id: 'q1', answer: 'a' },
      { question_id: 'q2', answer: 'b' },
    ]);

    const result = await matchingService.calculateCompatibility(1, 2);

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.scoreBreakdown.locationAndAge).toBeGreaterThan(20);
    expect(result.scoreBreakdown.details.hobbyJaccard).toBe(1.0);
    expect(result.scoreBreakdown.details.quizAgreement).toBe(1.0);
    expect(Match.upsertMatch).toHaveBeenCalledWith(1, 2, result.score, result.scoreBreakdown, undefined);
  });

  it('throws error when target profile is not found', async () => {
    Profile.findByPk.mockImplementation(async (id) => (id === 1 ? { user_id: 1 } : null));

    await expect(matchingService.calculateCompatibility(1, 999)).rejects.toThrow(
      'Target user profile not found'
    );
  });

  it('throws error when computing compatibility with self in getMatchWithUser', async () => {
    await expect(matchingService.getMatchWithUser(1, 1)).rejects.toThrow(
      'Cannot compute compatibility with yourself'
    );
  });
});
