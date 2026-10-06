/**
 * Phase 6 integration tests — preferences, hobby selection and quiz answers
 * through real HTTP requests and a real database (DB_TEST_DATABASE).
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;

const request = require('supertest');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');
const quizService = require('../../src/services/quizService');

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';

let db;
let seq = 0;
let hobbyIds = {}; // name → id

async function signUpAndLogin() {
  const email = `pref${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  await request(app).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const login = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
  const done = await request(app)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, face_detected: true, face_count: 1 });
  return { userId: reg.body.data.user_id, token: done.body.data.access_token };
}

const as = (token) => {
  const call = (method) => (path, body) => {
    const req = request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  };
  return { get: call('get'), post: call('post'), put: call('put'), delete: call('delete') };
};

const PREFS = {
  preferredLocation: 'Kolhapur, Maharashtra',
  preferredEducation: 'M.Tech',
  preferredOccupation: 'Software Developer',
  preferredLifestyle: 'Active',
  preferredFood: 'vegetarian',
  partnerMinAge: 25,
  partnerMaxAge: 32,
  preferredGenders: ['male'],
};

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
  await db.seed.run();
  // An inactive hobby for the "cannot select inactive" tests.
  await db('hobbies').insert({ hobby_name: `Retired hobby ${Date.now()}`, status: 'inactive' }).onConflict('hobby_name').ignore();
  const rows = await db('hobbies').select('hobby_id', 'hobby_name', 'status');
  hobbyIds = Object.fromEntries(rows.map((r) => [r.status === 'inactive' ? '__inactive' : r.hobby_name, r.hobby_id]));
}, 60000);

afterAll(async () => {
  await closeConnection();
});

/* ---------------- authentication ---------------- */

describe('authentication', () => {
  it.each([
    ['get', '/api/v1/preferences'],
    ['post', '/api/v1/preferences'],
    ['put', '/api/v1/preferences'],
    ['get', '/api/v1/preferences/options'],
    ['put', '/api/v1/preferences/hobbies'],
    ['delete', '/api/v1/preferences/hobbies/1'],
    ['get', '/api/v1/preferences/quiz'],
    ['put', '/api/v1/preferences/quiz'],
    ['get', '/api/v1/hobbies'],
  ])('%s %s requires a valid access token', async (method, url) => {
    const res = await request(app)[method](url).send(PREFS);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Authentication required' });
  });
});

/* ---------------- hobby catalogue ---------------- */

describe('GET /hobbies', () => {
  it('returns active hobbies only, as { id, name }', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).get('/hobbies');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(24);
    expect(res.body.data[0]).toEqual({ id: expect.any(Number), name: expect.any(String) });
    expect(Object.keys(res.body.data[0])).toEqual(['id', 'name']);
    expect(res.body.data.map((h) => h.id)).not.toContain(hobbyIds.__inactive);
    const names = res.body.data.map((h) => h.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

/* ---------------- preferences ---------------- */

describe('preferences', () => {
  it('returns an empty, not-yet-set structure before anything is saved', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).get('/preferences');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isSet: false,
      preferredLocation: null,
      preferredFood: null,
      preferredGenders: [],
      hobbies: [],
      quizAnswers: [],
    });
  });

  it('creates preferences and returns them', async () => {
    const { token, userId } = await signUpAndLogin();
    const res = await as(token).post('/preferences', PREFS);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, message: 'Preferences saved successfully' });
    expect(res.body.data).toEqual({
      isSet: true,
      ...PREFS,
      hobbies: [],
      quizAnswers: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    // Stored in structured columns, not one JSON blob.
    const row = await db('preferences').where({ user_id: userId }).first();
    expect(row).toMatchObject({
      preferred_location: 'Kolhapur, Maharashtra',
      preferred_education: 'M.Tech',
      preferred_occupation: 'Software Developer',
      lifestyle_preference: 'Active',
      food_preference: 'vegetarian',
      partner_min_age: 25,
      partner_max_age: 32,
    });
    expect(await as(token).get('/preferences').then((r) => r.body.data)).toEqual(res.body.data);
  });

  it('returns 409 on a second create and 404 when updating before creating', async () => {
    const { token } = await signUpAndLogin();
    expect((await as(token).put('/preferences', { preferredFood: 'vegan' })).status).toBe(404);
    expect((await as(token).post('/preferences', PREFS)).status).toBe(201);
    expect((await as(token).post('/preferences', PREFS)).status).toBe(409);
  });

  it('updates only the provided fields and can clear them', async () => {
    const { token } = await signUpAndLogin();
    await as(token).post('/preferences', PREFS);
    await db('preferences').update({ updated_at: new Date('2020-01-01T00:00:00Z') });

    const res = await as(token).put('/preferences', { preferredOccupation: 'Doctor', preferredLifestyle: null, preferredGenders: [] });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Preferences updated successfully');
    expect(res.body.data).toMatchObject({
      preferredLocation: PREFS.preferredLocation,
      preferredOccupation: 'Doctor',
      preferredLifestyle: null,
      preferredGenders: [],
    });
    expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThan(new Date('2021-01-01').getTime());
  });

  it('keeps the partner age range valid against stored values', async () => {
    const { token } = await signUpAndLogin();
    await as(token).post('/preferences', PREFS); // 25–32
    const res = await as(token).put('/preferences', { partnerMinAge: 40 });

    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([{ field: 'body.partnerMinAge', message: 'Minimum partner age cannot be greater than the maximum' }]);
  });

  it.each([
    [{ preferredFood: 'pizza' }, 'body.preferredFood'],
    [{ preferredLocation: 'Pune <b>' }, 'body.preferredLocation'],
    [{ preferredEducation: 'x'.repeat(151) }, 'body.preferredEducation'],
    [{ partnerMinAge: 16 }, 'body.partnerMinAge'],
    [{ partnerMinAge: 30, partnerMaxAge: 20 }, 'body.partnerMinAge'],
    [{ partnerMaxAge: '30' }, 'body.partnerMaxAge'],
    [{ preferredGenders: ['male', 'male'] }, 'body.preferredGenders'],
    [{ preferredGenders: ['robot'] }, 'body.preferredGenders.0'],
  ])('rejects invalid data %j with 422', async (body, field) => {
    const { token } = await signUpAndLogin();
    const res = await as(token).post('/preferences', body);
    expect(res.status).toBe(422);
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('provides the option lists the UI needs', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).get('/preferences/options');
    expect(res.status).toBe(200);
    expect(res.body.data.foodPreferences).toContainEqual({ value: 'vegetarian', label: 'Vegetarian' });
    expect(res.body.data).toMatchObject({ partnerAge: { min: 18, max: 100 }, maxHobbies: 20 });
  });
});

/* ---------------- ownership ---------------- */

describe('data ownership', () => {
  it.each([[{ user_id: 2 }], [{ userId: 2 }], [{ role: 'admin' }]])(
    'rejects attempts to target other data: %j',
    async (extra) => {
      const { token } = await signUpAndLogin();
      const res = await as(token).post('/preferences', { ...PREFS, ...extra });
      expect(res.status).toBe(422);
      expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
    }
  );

  it("never changes another user's preferences, hobbies or answers", async () => {
    const alice = await signUpAndLogin();
    const bob = await signUpAndLogin();
    await as(bob.token).post('/preferences', {
      ...PREFS,
      hobbyIds: [hobbyIds.Music],
      quizAnswers: [{ questionId: 'weekend_style', answer: 'home' }],
    });
    const bobBefore = (await as(bob.token).get('/preferences')).body.data;

    await as(alice.token).post('/preferences', { preferredFood: 'vegan', hobbyIds: [hobbyIds.Reading] });
    await as(alice.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Cricket] });
    await as(alice.token).put('/preferences/quiz', { answers: [{ questionId: 'weekend_style', answer: 'social' }] });
    // Alice cannot remove Bob's hobby: the mapping is looked up for Alice only.
    expect((await as(alice.token).delete(`/preferences/hobbies/${hobbyIds.Music}`)).status).toBe(404);

    expect((await as(bob.token).get('/preferences')).body.data).toEqual(bobBefore);
  });
});

/* ---------------- hobbies ---------------- */

describe('hobby selection', () => {
  let user;
  beforeEach(async () => {
    user = await signUpAndLogin();
  });

  const selected = async () => (await as(user.token).get('/preferences')).body.data.hobbies.map((h) => h.name);
  const mappings = () => db('user_hobbies').where({ user_id: user.userId }).count({ n: '*' }).first();

  it('selects multiple hobbies (works before preferences exist)', async () => {
    const res = await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Reading, hobbyIds.Technology, hobbyIds.Travelling] });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Hobbies updated successfully' });
    expect(res.body.data.hobbies.map((h) => h.name)).toEqual(['Reading', 'Technology', 'Travelling']);
  });

  it('replaces the selection exactly, leaving no obsolete mappings', async () => {
    await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Reading, hobbyIds.Technology] });
    const res = await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Travelling, hobbyIds.Music] });

    expect(res.body.data.hobbies.map((h) => h.name)).toEqual(['Music', 'Travelling']);
    const rows = await db('user_hobbies').where({ user_id: user.userId }).pluck('hobby_id');
    expect(rows.sort()).toEqual([hobbyIds.Travelling, hobbyIds.Music].sort());
  });

  it('never stores duplicates', async () => {
    const dup = await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Music, hobbyIds.Music] });
    expect(dup.status).toBe(422);
    expect(dup.body.errors[0].message).toBe('hobbyIds must not contain duplicates');

    // Re-saving the same selection keeps one row per hobby.
    await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Music] });
    await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Music] });
    expect(Number((await mappings()).n)).toBe(1);
  });

  it('removes one hobby, and clears all with an empty list', async () => {
    await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Reading, hobbyIds.Music] });
    const res = await as(user.token).delete(`/preferences/hobbies/${hobbyIds.Reading}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Hobby removed', data: { hobbies: [{ id: hobbyIds.Music, name: 'Music' }] } });

    expect((await as(user.token).delete(`/preferences/hobbies/${hobbyIds.Reading}`)).status).toBe(404);
    expect((await as(user.token).put('/preferences/hobbies', { hobbyIds: [] })).body.data.hobbies).toEqual([]);
    expect(Number((await mappings()).n)).toBe(0);
  });

  it.each([
    ['an unknown id', () => 999999],
    ['an inactive hobby', () => hobbyIds.__inactive],
  ])('rejects %s', async (label, getId) => {
    // Ids are resolved at run time (they are loaded in beforeAll).
    const res = await as(user.token).put('/preferences/hobbies', { hobbyIds: [getId()] });
    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([{ field: 'body.hobbyIds', message: `Unknown or inactive hobby: ${getId()}` }]);
  });

  it.each([
    [{ hobbyIds: ['abc'] }],
    [{ hobbyIds: [0] }],
    [{ hobbyIds: 'Reading' }],
    [{ hobbyNames: ['Reading'] }],
    [{ hobbyIds: Array.from({ length: 21 }, (_, i) => i + 1) }],
    [{ hobbyIds: [1], user_id: 5 }],
  ])('rejects malformed input %j', async (body) => {
    expect((await as(user.token).put('/preferences/hobbies', body)).status).toBe(422);
  });

  it('rejects a non-numeric hobby id in the URL', async () => {
    expect((await as(user.token).delete('/preferences/hobbies/abc')).status).toBe(422);
  });

  it('a selection that is unchanged keeps working after a hobby is deactivated elsewhere', async () => {
    const tempName = `Temp hobby ${Date.now()}`;
    await db('hobbies').insert({ hobby_name: tempName });
    const tempId = (await db('hobbies').where({ hobby_name: tempName }).first()).hobby_id;
    await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Music, tempId] });
    await db('hobbies').where({ hobby_id: tempId }).update({ status: 'inactive' });

    // Inactive hobbies disappear from the user's list…
    expect(await selected()).toEqual(['Music']);
    // …and cannot be re-selected.
    expect((await as(user.token).put('/preferences/hobbies', { hobbyIds: [hobbyIds.Music, tempId] })).status).toBe(422);
  });
});

/* ---------------- quiz ---------------- */

describe('quiz answers', () => {
  let user;
  beforeEach(async () => {
    user = await signUpAndLogin();
  });

  it('returns the configured questionnaire (marked as sample) and no answers yet', async () => {
    const res = await as(user.token).get('/preferences/quiz');
    expect(res.status).toBe(200);
    expect(res.body.data.questionnaire).toMatchObject({ version: 'sample-1', status: 'sample' });
    expect(res.body.data.questionnaire.questions.map((q) => q.id)).toEqual([
      'weekend_style',
      'communication_style',
      'core_values',
      'ideal_partner',
    ]);
    expect(res.body.data.answers).toEqual([]);
  });

  it('saves and updates answers of every question type', async () => {
    const first = await as(user.token).put('/preferences/quiz', {
      answers: [
        { questionId: 'weekend_style', answer: 'outdoors' },
        { questionId: 'core_values', answer: ['family', 'health'] },
        { questionId: 'ideal_partner', answer: '  Kind,\r\n\r\n\r\nhonest  ' },
      ],
    });
    expect(first.status).toBe(200);
    expect(first.body.message).toBe('Quiz answers saved successfully');
    expect(first.body.data.answers).toEqual([
      { questionId: 'weekend_style', answer: 'outdoors' },
      { questionId: 'core_values', answer: ['family', 'health'] },
      { questionId: 'ideal_partner', answer: 'Kind,\n\nhonest' },
    ]);

    const second = await as(user.token).put('/preferences/quiz', {
      answers: [
        { questionId: 'weekend_style', answer: 'home' },
        { questionId: 'ideal_partner', answer: null }, // remove
      ],
    });
    expect(second.body.data.answers).toEqual([
      { questionId: 'weekend_style', answer: 'home' },
      { questionId: 'core_values', answer: ['family', 'health'] },
    ]);
    // One row per question.
    const rows = await db('quiz_answers').where({ user_id: user.userId });
    expect(rows).toHaveLength(2);
  });

  it.each([
    [[{ questionId: 'not_a_question', answer: 'x' }], 'body.answers.0.questionId', 'Unknown question: not_a_question'],
    [[{ questionId: 'weekend_style', answer: 'skydiving' }], 'body.answers.0.answer', 'Choose one of the listed options'],
    [[{ questionId: 'weekend_style', answer: ['home'] }], 'body.answers.0.answer', 'Choose one of the listed options'],
    [[{ questionId: 'core_values', answer: ['family', 'career', 'faith', 'health'] }], 'body.answers.0.answer', 'Choose at most 3 options'],
    [[{ questionId: 'core_values', answer: ['family', 'family'] }], 'body.answers.0.answer', 'Options must not repeat'],
    [[{ questionId: 'core_values', answer: [] }], 'body.answers.0.answer', 'Choose at least one option'],
    [[{ questionId: 'ideal_partner', answer: 'x'.repeat(301) }], 'body.answers.0.answer', 'Answer must be at most 300 characters'],
    [[{ questionId: 'ideal_partner', answer: '   ' }], 'body.answers.0.answer', 'Answer must not be empty (use null to remove it)'],
    [
      [{ questionId: 'weekend_style', answer: 'home' }, { questionId: 'weekend_style', answer: 'social' }],
      'body.answers',
      'Each question can be answered only once',
    ],
  ])('rejects invalid answers %j', async (answers, field, message) => {
    const res = await as(user.token).put('/preferences/quiz', { answers });
    expect(res.status).toBe(422);
    expect(res.body.errors).toContainEqual({ field, message });
    expect(await db('quiz_answers').where({ user_id: user.userId })).toEqual([]);
  });

  it('saves all answers or none', async () => {
    const res = await as(user.token).put('/preferences/quiz', {
      answers: [
        { questionId: 'weekend_style', answer: 'home' },
        { questionId: 'communication_style', answer: 'smoke_signals' },
      ],
    });
    expect(res.status).toBe(422);
    expect(await db('quiz_answers').where({ user_id: user.userId })).toEqual([]);
  });
});

/* ---------------- one transaction for everything ---------------- */

describe('saving preferences, hobbies and quiz together', () => {
  it('saves all three in one request', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).post('/preferences', {
      ...PREFS,
      hobbyIds: [hobbyIds.Photography, hobbyIds.Music],
      quizAnswers: [{ questionId: 'communication_style', answer: 'calls' }],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.hobbies.map((h) => h.name)).toEqual(['Music', 'Photography']);
    expect(res.body.data.quizAnswers).toEqual([{ questionId: 'communication_style', answer: 'calls' }]);
  });

  it('rolls everything back when a later part is invalid (no partial update)', async () => {
    const { token, userId } = await signUpAndLogin();
    await as(token).post('/preferences', { ...PREFS, hobbyIds: [hobbyIds.Reading] });
    const before = (await as(token).get('/preferences')).body.data;

    // Preferences are written first, then hobbies fail inside the transaction.
    const res = await as(token).put('/preferences', {
      preferredLocation: 'Pune',
      hobbyIds: [hobbyIds.Music, hobbyIds.__inactive],
    });
    expect(res.status).toBe(422);
    expect((await as(token).get('/preferences')).body.data).toEqual(before);

    // Preferences and hobbies are written, then the quiz answer fails.
    const res2 = await as(token).post('/preferences', {}); // 409 — exists
    expect(res2.status).toBe(409);
    const res3 = await as(token).put('/preferences', {
      preferredLocation: 'Pune',
      hobbyIds: [hobbyIds.Music],
      quizAnswers: [{ questionId: 'weekend_style', answer: 'nope' }],
    });
    expect(res3.status).toBe(422);
    expect(res3.body.errors[0].field).toBe('body.quizAnswers.0.answer');
    expect((await as(token).get('/preferences')).body.data).toEqual(before);
    expect(await db('user_hobbies').where({ user_id: userId }).pluck('hobby_id')).toEqual([hobbyIds.Reading]);
  });

  it('rolls back when the database fails part-way through', async () => {
    const { token, userId } = await signUpAndLogin();
    await as(token).post('/preferences', { ...PREFS, hobbyIds: [hobbyIds.Reading] });
    const before = (await as(token).get('/preferences')).body.data;

    const spy = jest.spyOn(quizService, 'saveAnswers').mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }));
    const res = await as(token).put('/preferences', {
      preferredOccupation: 'Pilot',
      hobbyIds: [hobbyIds.Cricket],
      quizAnswers: [{ questionId: 'weekend_style', answer: 'home' }],
    });
    spy.mockRestore();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, message: 'Service temporarily unavailable, please try again later' });
    expect((await as(token).get('/preferences')).body.data).toEqual(before);
    expect(await db('user_hobbies').where({ user_id: userId }).pluck('hobby_id')).toEqual([hobbyIds.Reading]);
  });
});

/* ---------------- no matching in this phase ---------------- */

describe('scope', () => {
  it('responses contain no compatibility scores, ranks or account data', async () => {
    const { token } = await signUpAndLogin();
    const responses = [
      await as(token).post('/preferences', { ...PREFS, hobbyIds: [hobbyIds.Music] }),
      await as(token).get('/preferences'),
      await as(token).get('/preferences/quiz'),
      await as(token).get('/hobbies'),
    ];
    for (const res of responses) {
      expect(JSON.stringify(res.body)).not.toMatch(/score|compatib|rank|recommend|weight|password|hash|token|email|"role"/i);
    }
  });

  it('the Phase 5 profile module keeps working', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).post('/profile', { name: 'Asha Patil', dateOfBirth: '1996-08-15' });
    expect(res.status).toBe(201);
    expect((await as(token).get('/profile')).body.data.name).toBe('Asha Patil');
  });
});
