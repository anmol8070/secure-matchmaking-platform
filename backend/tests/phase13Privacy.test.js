/**
 * Phase 13 — privacy rules (pure functions) and payload validation.
 * Database-backed enforcement: tests/integration/privacy.test.js.
 */
process.env.NODE_ENV = 'test';

const privacyService = require('../src/services/privacyService');
const { updatePrivacyBody } = require('../src/validators/privacyValidator');
const { createReportBody } = require('../src/validators/reportValidator');

const { allowedFields, filterMatchItem, DEFAULTS, RELATIONSHIP } = privacyService;
const settings = (overrides = {}) => ({ ...DEFAULTS, ...overrides });

describe('allowedFields', () => {
  it('shows "everyone" fields to members and connections, never to blocked users', () => {
    expect(allowedFields(settings(), RELATIONSHIP.MEMBER)).toMatchObject({ photo: true, location: true, hobbies: true, onlineStatus: false });
    expect(allowedFields(settings(), RELATIONSHIP.CONNECTION)).toMatchObject({ location: true, onlineStatus: true });
    expect(Object.values(allowedFields(settings(), RELATIONSHIP.BLOCKED)).every((v) => v === false)).toBe(true);
  });

  it('applies connections / nobody per field, and the owner always sees everything', () => {
    const s = settings({ locationVisibility: 'connections', educationVisibility: 'nobody' });
    expect(allowedFields(s, RELATIONSHIP.MEMBER)).toMatchObject({ location: false, education: false, occupation: true });
    expect(allowedFields(s, RELATIONSHIP.CONNECTION)).toMatchObject({ location: true, education: false });
    expect(Object.values(allowedFields(s, RELATIONSHIP.SELF)).every(Boolean)).toBe(true);
  });

  it('reduces a "connections only" profile to name (+ public photo) for non-connections', () => {
    const s = settings({ profileVisibility: 'connections' });
    const member = allowedFields(s, RELATIONSHIP.MEMBER);
    expect(member.photo).toBe(true);
    expect(Object.entries(member).filter(([k, v]) => v && k !== 'photo')).toEqual([]);
    expect(allowedFields(s, RELATIONSHIP.CONNECTION).location).toBe(true);
  });
});

describe('filterMatchItem', () => {
  const profile = {
    name: 'Riya',
    gender: 'female',
    date_of_birth: '1996-01-01',
    city: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    education: 'MBA',
    occupation: 'Pilot',
    lifestyle: 'Active',
    bio: 'Hi',
    profile_photo_url: null,
  };
  const item = {
    userId: 4,
    compatibilityScore: 80,
    commonHobbies: ['Chess'],
    whyThisMatch: ['You both live in Pune', 'You share 1 hobby: Chess', 'Occupation matches your preference (Pilot)', 'High compatibility quiz answer agreement (90%)'],
    scoreBreakdown: { location: { similarity: 1 }, occupation: { similarity: 1 }, quiz: { similarity: 0.9 }, details: { hobbyJaccard: 0.5, quizAgreement: 0.9 } },
    mlFeatures: { location_similarity: 1, occupation_similarity: 1, hobby_similarity: 0.5, quiz_similarity: 0.9 },
  };

  it('keeps everything with default settings', () => {
    const out = filterMatchItem(item, profile, settings(), RELATIONSHIP.MEMBER);
    expect(out.profile).toMatchObject({ location: 'Pune, Maharashtra, India', occupation: 'Pilot' });
    expect(out.whyThisMatch).toHaveLength(4);
    expect(out.commonHobbies).toEqual(['Chess']);
  });

  it('removes hidden values from the profile, reasons, hobbies, breakdown and ML features', () => {
    const s = settings({ locationVisibility: 'nobody', hobbiesVisibility: 'nobody', occupationVisibility: 'connections' });
    const out = filterMatchItem(item, profile, s, RELATIONSHIP.MEMBER);
    expect(out.profile).toMatchObject({ location: null, occupation: null, education: 'MBA', name: 'Riya' });
    expect(out.commonHobbies).toEqual([]);
    expect(out.whyThisMatch).toEqual(['High compatibility quiz answer agreement (90%)']);
    expect(out.scoreBreakdown).toEqual({ quiz: { similarity: 0.9 }, details: { quizAgreement: 0.9 } });
    expect(out.mlFeatures).toEqual({ quiz_similarity: 0.9 });
    expect(out.compatibilityScore).toBe(80);
    expect(JSON.stringify(out)).not.toMatch(/Pune|Chess|Pilot/);
    // The input is not mutated.
    expect(item.scoreBreakdown.location).toBeDefined();
  });
});

describe('validation', () => {
  it('accepts only known settings and levels, and never a user id', () => {
    expect(updatePrivacyBody.parse({ locationVisibility: 'nobody' })).toEqual({ locationVisibility: 'nobody' });
    for (const body of [{ userId: 2, bioVisibility: 'nobody' }, { foo: 'everyone' }, { bioVisibility: 'friends' }, { profileVisibility: 'nobody' }, {}]) {
      expect(updatePrivacyBody.safeParse(body).success).toBe(false);
    }
  });

  it('normalises report reasons and bounds the description', () => {
    expect(createReportBody.parse({ reportedUserId: '5', reason: ' SPAM ', description: '  details ' })).toEqual({ reportedUserId: 5, reason: 'spam', description: 'details' });
    for (const body of [
      { reportedUserId: 5, reason: 'rude' },
      { reportedUserId: 5, reason: 'spam', description: 'x'.repeat(2001) },
      { reportedUserId: 5, reason: 'spam', status: 'resolved' },
      { reportedUserId: 5, reason: 'spam', reporterId: 1 },
    ]) {
      expect(createReportBody.safeParse(body).success).toBe(false);
    }
  });
});
