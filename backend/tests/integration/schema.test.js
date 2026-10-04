/**
 * Database schema integration tests (Phase 2).
 *
 * Runs against a real PostgreSQL or MySQL/MariaDB server using the DB_* settings
 * in backend/.env, on a separate test database:
 *   DB_TEST_DATABASE (default: "<DB_DATABASE>_test")
 *
 * The test database is rolled back to empty, migrated from scratch, exercised,
 * rolled back again and re-migrated. Run with: npm run test:db
 */
process.env.NODE_ENV = 'test';

const knex = require('knex');
const config = require('../../src/config/environment');
const { buildKnexConfig } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;

const APP_TABLES = [
  'users',
  'profiles',
  'preferences',
  'hobbies',
  'user_hobbies',
  'quiz_answers',
  'matches',
  'connection_requests',
  'messages',
  'reports',
  'blocks',
  'activity_feedback',
  'login_verifications',
  // Phase 4
  'otp_codes',
  'user_sessions',
];

// Violation kinds -> PostgreSQL SQLSTATE codes and MySQL/MariaDB error numbers.
// (mysql2 names errors from MySQL's table, so MariaDB's CHECK errno 4025 gets a
// misleading name — compare numbers instead.)
const ERROR_CODES = {
  unique: { pg: ['23505'], mysql: [1062] },
  foreignKey: { pg: ['23503'], mysql: [1452, 1216] },
  // PostgreSQL raises 23001 restrict_violation for ON DELETE RESTRICT
  referenced: { pg: ['23001', '23503'], mysql: [1451, 1217] },
  check: { pg: ['23514'], mysql: [4025 /* MariaDB */, 3819 /* MySQL */] },
};

let db;
let isPg;
let seq = 0;

async function expectViolation(promise, ...kinds) {
  let error;
  try {
    await promise;
  } catch (err) {
    error = err;
  }
  expect(error).toBeDefined();
  const allowed = kinds.flatMap((kind) => ERROR_CODES[kind][isPg ? 'pg' : 'mysql']);
  expect(allowed).toContain(isPg ? error.code : error.errno);
}

async function insertReturningId(table, row, idColumn) {
  // pg needs RETURNING and gives [{ id }]; mysql has no RETURNING and gives [insertId]
  if (isPg) {
    const [result] = await db(table).insert(row, [idColumn]);
    return result[idColumn];
  }
  const [insertId] = await db(table).insert(row);
  return insertId;
}

function createUser(overrides = {}) {
  seq += 1;
  return insertReturningId(
    'users',
    { email: `user${seq}_${Date.now()}@example.com`, ...overrides },
    'user_id'
  );
}

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

async function foreignKeys() {
  const sql = isPg
    ? `SELECT kcu.table_name AS table_name, kcu.column_name AS column_name,
              ccu.table_name AS ref_table, ccu.column_name AS ref_column, rc.delete_rule AS delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = rc.constraint_name AND ccu.constraint_schema = rc.constraint_schema
        WHERE rc.constraint_schema = current_schema()`
    : `SELECT kcu.table_name AS table_name, kcu.column_name AS column_name,
              kcu.referenced_table_name AS ref_table, kcu.referenced_column_name AS ref_column,
              rc.delete_rule AS delete_rule
         FROM information_schema.referential_constraints rc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
          AND kcu.table_name = rc.table_name
        WHERE rc.constraint_schema = DATABASE()`;
  const result = await db.raw(sql);
  const rows = isPg ? result.rows : result[0];
  return rows
    .map((r) => `${r.table_name}.${r.column_name} -> ${r.ref_table}.${r.ref_column} ${r.delete_rule}`)
    .sort();
}

async function primaryKeys() {
  const schema = isPg ? 'current_schema()' : 'DATABASE()';
  const result = await db.raw(`
    SELECT kcu.table_name AS table_name, kcu.column_name AS column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
     WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = ${schema}
     ORDER BY kcu.table_name, kcu.ordinal_position`);
  const rows = isPg ? result.rows : result[0];
  return rows.reduce((acc, r) => {
    (acc[r.table_name] ||= []).push(r.column_name);
    return acc;
  }, {});
}

/** Returns the column lists of every index on a table, e.g. [['sender_id','receiver_id']]. */
async function indexColumns(table) {
  if (isPg) {
    const { rows } = await db.raw(
      `SELECT array_to_json(array_agg(a.attname ORDER BY k.ord)) AS cols
         FROM pg_index x
         JOIN pg_class t ON t.oid = x.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = current_schema()
         CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE t.relname = ?
        GROUP BY x.indexrelid`,
      [table]
    );
    return rows.map((r) => parseJson(r.cols));
  }
  const [rows] = await db.raw(
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ?
      GROUP BY index_name`,
    [table]
  );
  return rows.map((r) => r.cols.split(','));
}

beforeAll(async () => {
  if (TEST_DB === config.db.database) {
    throw new Error('DB_TEST_DATABASE must differ from DB_DATABASE — the tests drop all tables.');
  }
  await createDatabase(TEST_DB);
  db = knex(buildKnexConfig(config.db, { database: TEST_DB }));
  isPg = db.client.dialect === 'postgresql';

  // Start from a clean database, then build everything from migrations.
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
}, 60000);

afterAll(async () => {
  if (db) await db.destroy();
});

describe('schema structure', () => {
  it('creates every required table', async () => {
    for (const table of APP_TABLES) {
      expect({ table, exists: await db.schema.hasTable(table) }).toEqual({ table, exists: true });
    }
  });

  it('defines the expected primary keys', async () => {
    const pks = await primaryKeys();
    expect(pks).toMatchObject({
      users: ['user_id'],
      profiles: ['user_id'],
      preferences: ['user_id'],
      hobbies: ['hobby_id'],
      user_hobbies: ['user_id', 'hobby_id'],
      quiz_answers: ['id'],
      matches: ['match_id'],
      connection_requests: ['request_id'],
      messages: ['message_id'],
      reports: ['report_id'],
      blocks: ['block_id'],
      activity_feedback: ['id'],
      login_verifications: ['verification_id'],
      otp_codes: ['otp_id'],
      user_sessions: ['session_id'],
    });
  });

  it('defines every foreign key with the documented delete rule', async () => {
    expect(await foreignKeys()).toEqual(
      [
        'activity_feedback.target_user_id -> users.user_id RESTRICT',
        'activity_feedback.user_id -> users.user_id RESTRICT',
        'blocks.blocked_id -> users.user_id RESTRICT',
        'blocks.blocker_id -> users.user_id RESTRICT',
        'connection_requests.receiver_id -> users.user_id RESTRICT',
        'connection_requests.sender_id -> users.user_id RESTRICT',
        'login_verifications.user_id -> users.user_id CASCADE',
        'otp_codes.user_id -> users.user_id CASCADE',
        'user_sessions.login_verification_id -> login_verifications.verification_id SET NULL',
        'user_sessions.user_id -> users.user_id CASCADE',
        'matches.user1_id -> users.user_id RESTRICT',
        'matches.user2_id -> users.user_id RESTRICT',
        'messages.receiver_id -> users.user_id RESTRICT',
        'messages.sender_id -> users.user_id RESTRICT',
        'preferences.user_id -> users.user_id CASCADE',
        'profiles.user_id -> users.user_id CASCADE',
        'quiz_answers.user_id -> users.user_id CASCADE',
        'reports.reported_id -> users.user_id RESTRICT',
        'reports.reporter_id -> users.user_id RESTRICT',
        'reports.reviewed_by -> users.user_id SET NULL',
        'user_hobbies.hobby_id -> hobbies.hobby_id RESTRICT',
        'user_hobbies.user_id -> users.user_id CASCADE',
      ].sort()
    );
  });

  it.each([
    ['users', 'email'],
    ['users', 'mobile'],
    ['user_hobbies', 'hobby_id'],
    ['matches', 'user1_id'],
    ['matches', 'user2_id'],
    ['connection_requests', 'sender_id'],
    ['connection_requests', 'receiver_id'],
    ['messages', 'sender_id'],
    ['messages', 'receiver_id'],
    ['reports', 'reporter_id'],
    ['reports', 'reported_id'],
    ['blocks', 'blocker_id'],
    ['blocks', 'blocked_id'],
    ['activity_feedback', 'user_id'],
    ['activity_feedback', 'target_user_id'],
    ['login_verifications', 'user_id'],
  ])('%s has an index led by %s', async (table, column) => {
    const indexes = await indexColumns(table);
    expect(indexes.some((cols) => cols[0] === column)).toBe(true);
  });

  it('indexes conversations by (sender_id, receiver_id, sent_at)', async () => {
    expect(await indexColumns('messages')).toContainEqual(['sender_id', 'receiver_id', 'sent_at']);
  });

  it('seeds the hobby master list idempotently', async () => {
    const before = await db('hobbies').count({ n: '*' }).first();
    await db.seed.run();
    const after = await db('hobbies').count({ n: '*' }).first();
    expect(Number(before.n)).toBeGreaterThan(0);
    expect(Number(after.n)).toBe(Number(before.n));
  });

  it('seeds no users, matches or recommendation data', async () => {
    // Runs before any test inserts rows, so these tables hold only seed output.
    for (const table of ['users', 'matches', 'activity_feedback']) {
      const count = await db(table).count({ n: '*' }).first();
      expect({ table, n: Number(count.n) }).toEqual({ table, n: 0 });
    }
  });
});

describe('users', () => {
  it('applies defaults for role, status and timestamps', async () => {
    const id = await createUser();
    const user = await db('users').where({ user_id: id }).first();
    expect(user).toMatchObject({ role: 'user', status: 'pending_verification' });
    expect(user.created_at).toBeInstanceOf(Date);
    expect(user.updated_at).toBeInstanceOf(Date);
  });

  it('rejects duplicate email and mobile', async () => {
    await createUser({ email: 'dup@example.com', mobile: '+910000000001' });
    await expectViolation(createUser({ email: 'dup@example.com' }), 'unique');
    await expectViolation(createUser({ mobile: '+910000000001' }), 'unique');
  });

  it('rejects an email that differs only by case', async () => {
    await createUser({ email: 'case@example.com' });
    // PostgreSQL: lower-case CHECK; MySQL: case-insensitive collation on the unique index.
    await expectViolation(createUser({ email: 'CASE@example.com' }), 'unique', 'check');
  });

  it('allows several accounts without a mobile number', async () => {
    await createUser({ mobile: null });
    await createUser({ mobile: null });
  });

  it('requires an email or a mobile number', async () => {
    await expectViolation(createUser({ email: null, mobile: null }), 'check');
  });

  it('rejects unknown status and role values', async () => {
    await expectViolation(createUser({ status: 'unknown' }), 'check');
    await expectViolation(createUser({ role: 'superuser' }), 'check');
  });

  it('maintains updated_at on update', async () => {
    const id = await createUser({ updated_at: new Date('2020-01-01T00:00:00Z') });
    await db('users').where({ user_id: id }).update({ status: 'active' });
    const user = await db('users').where({ user_id: id }).first();
    expect(user.updated_at.getTime()).toBeGreaterThan(new Date('2021-01-01T00:00:00Z').getTime());
  });
});

describe('profiles and preferences (1:1 with users)', () => {
  it('links one profile to one user', async () => {
    const userId = await createUser();
    await db('profiles').insert({
      user_id: userId,
      name: 'Asha',
      date_of_birth: '1995-04-12',
      city: 'Pune',
      country: 'India',
      profile_photo_url: 'https://cdn.example.com/p/1.jpg',
    });

    const row = await db('users')
      .join('profiles', 'profiles.user_id', 'users.user_id')
      .where('users.user_id', userId)
      .first('profiles.name');
    expect(row.name).toBe('Asha');

    await expectViolation(db('profiles').insert({ user_id: userId, name: 'Again' }), 'unique');
    await expectViolation(db('profiles').insert({ user_id: 999999999, name: 'Ghost' }), 'foreignKey');
    await expectViolation(db('profiles').insert({ user_id: await createUser(), name: '' }), 'check');
  });

  it('links one preferences row to one user and validates the age range', async () => {
    const userId = await createUser();
    await db('preferences').insert({
      user_id: userId,
      food_preference: 'vegetarian',
      partner_min_age: 25,
      partner_max_age: 32,
      partner_preferences: JSON.stringify({ education: ['graduate'] }),
    });
    const prefs = await db('preferences').where({ user_id: userId }).first();
    expect(parseJson(prefs.partner_preferences)).toEqual({ education: ['graduate'] });

    await expectViolation(db('preferences').insert({ user_id: userId }), 'unique');

    const other = await createUser();
    await expectViolation(
      db('preferences').insert({ user_id: other, partner_min_age: 40, partner_max_age: 30 }),
      'check'
    );
    await expectViolation(db('preferences').insert({ user_id: other, partner_min_age: 16 }), 'check');
  });
});

describe('hobbies (M:N with users)', () => {
  it('assigns hobbies to users without duplicates', async () => {
    const userId = await createUser();
    const hobbies = await db('hobbies').orderBy('hobby_id').limit(2);
    await db('user_hobbies').insert(hobbies.map((h) => ({ user_id: userId, hobby_id: h.hobby_id })));

    const names = await db('user_hobbies')
      .join('hobbies', 'hobbies.hobby_id', 'user_hobbies.hobby_id')
      .where('user_hobbies.user_id', userId)
      .pluck('hobbies.hobby_name');
    expect(names.sort()).toEqual(hobbies.map((h) => h.hobby_name).sort());

    await expectViolation(
      db('user_hobbies').insert({ user_id: userId, hobby_id: hobbies[0].hobby_id }),
      'unique'
    );
    await expectViolation(db('user_hobbies').insert({ user_id: userId, hobby_id: 999999 }), 'foreignKey');
  });

  it('rejects duplicate hobby names and deleting a hobby in use', async () => {
    await expectViolation(db('hobbies').insert({ hobby_name: 'Reading' }), 'unique');

    const hobby = await db('hobbies').where({ hobby_name: 'Reading' }).first();
    await db('user_hobbies').insert({ user_id: await createUser(), hobby_id: hobby.hobby_id });
    await expectViolation(db('hobbies').where({ hobby_id: hobby.hobby_id }).del(), 'referenced');
  });
});

describe('quiz_answers', () => {
  it('stores one answer per question per user', async () => {
    const userId = await createUser();
    await db('quiz_answers').insert({ user_id: userId, question_id: 'q_weekend', answer: 'outdoors' });
    await expectViolation(
      db('quiz_answers').insert({ user_id: userId, question_id: 'q_weekend', answer: 'indoors' }),
      'unique'
    );
  });
});

describe('matches', () => {
  it('stores a directional score with a JSON breakdown', async () => {
    const a = await createUser();
    const b = await createUser();
    const breakdown = { location: 18, education: 12, occupation: 8, hobbies: 20, lifestyle: 9, food: 10 };
    await db('matches').insert({
      user1_id: a,
      user2_id: b,
      score: 77.5,
      score_breakdown: JSON.stringify(breakdown),
    });
    // The reverse direction is a separate result.
    await db('matches').insert({ user1_id: b, user2_id: a, score: 64 });

    const row = await db('matches').where({ user1_id: a, user2_id: b }).first();
    expect(row.score).toBe(77.5);
    expect(parseJson(row.score_breakdown)).toEqual(breakdown);
  });

  it('rejects self-matches, duplicates and out-of-range scores', async () => {
    const a = await createUser();
    const b = await createUser();
    await expectViolation(db('matches').insert({ user1_id: a, user2_id: a, score: 50 }), 'check');
    await db('matches').insert({ user1_id: a, user2_id: b, score: 50 });
    await expectViolation(db('matches').insert({ user1_id: a, user2_id: b, score: 60 }), 'unique');
    await expectViolation(db('matches').insert({ user1_id: b, user2_id: a, score: 100.5 }), 'check');
    await expectViolation(db('matches').insert({ user1_id: b, user2_id: a, score: -1 }), 'check');
  });
});

describe('connection_requests', () => {
  it('creates pending requests and enforces the workflow states', async () => {
    const a = await createUser();
    const b = await createUser();
    const id = await insertReturningId(
      'connection_requests',
      { sender_id: a, receiver_id: b },
      'request_id'
    );
    expect((await db('connection_requests').where({ request_id: id }).first()).status).toBe('pending');

    await db('connection_requests').where({ request_id: id }).update({ status: 'accepted' });
    await expectViolation(
      db('connection_requests').where({ request_id: id }).update({ status: 'maybe' }),
      'check'
    );
  });

  it('rejects self-requests and duplicate requests', async () => {
    const a = await createUser();
    const b = await createUser();
    await expectViolation(db('connection_requests').insert({ sender_id: a, receiver_id: a }), 'check');
    await db('connection_requests').insert({ sender_id: a, receiver_id: b });
    await expectViolation(db('connection_requests').insert({ sender_id: a, receiver_id: b }), 'unique');
  });
});

describe('messages', () => {
  it('stores messages between two users and retrieves a conversation in order', async () => {
    const a = await createUser();
    const b = await createUser();
    await db('messages').insert([
      { sender_id: a, receiver_id: b, message: 'Hi', sent_at: new Date('2026-01-01T10:00:00Z') },
      { sender_id: b, receiver_id: a, message: 'Hello', sent_at: new Date('2026-01-01T10:01:00Z') },
    ]);

    const conversation = await db('messages')
      .where((q) => q.where({ sender_id: a, receiver_id: b }).orWhere({ sender_id: b, receiver_id: a }))
      .orderBy([{ column: 'sent_at' }, { column: 'message_id' }])
      .pluck('message');
    expect(conversation).toEqual(['Hi', 'Hello']);
  });

  it('rejects self-messages, empty messages and unknown users', async () => {
    const a = await createUser();
    const b = await createUser();
    await expectViolation(db('messages').insert({ sender_id: a, receiver_id: a, message: 'x' }), 'check');
    await expectViolation(db('messages').insert({ sender_id: a, receiver_id: b, message: '' }), 'check');
    await expectViolation(
      db('messages').insert({ sender_id: a, receiver_id: 999999999, message: 'x' }),
      'foreignKey'
    );
  });
});

describe('reports', () => {
  it('records reports for admin review and rejects self-reports', async () => {
    const reporter = await createUser();
    const reported = await createUser();
    const admin = await createUser({ role: 'admin' });
    const id = await insertReturningId(
      'reports',
      { reporter_id: reporter, reported_id: reported, reason: 'Spam' },
      'report_id'
    );
    await db('reports')
      .where({ report_id: id })
      .update({ status: 'resolved', reviewed_by: admin, reviewed_at: new Date() });

    await expectViolation(
      db('reports').insert({ reporter_id: reporter, reported_id: reporter, reason: 'x' }),
      'check'
    );

    // Removing the reviewing admin keeps the report and clears reviewed_by.
    await db('users').where({ user_id: admin }).del();
    const report = await db('reports').where({ report_id: id }).first();
    expect(report).toMatchObject({ status: 'resolved', reviewed_by: null });
  });
});

describe('blocks', () => {
  it('rejects self-blocks and duplicate blocks', async () => {
    const a = await createUser();
    const b = await createUser();
    await db('blocks').insert({ blocker_id: a, blocked_id: b });
    // Blocking back is a separate record.
    await db('blocks').insert({ blocker_id: b, blocked_id: a });
    await expectViolation(db('blocks').insert({ blocker_id: a, blocked_id: b }), 'unique');
    await expectViolation(db('blocks').insert({ blocker_id: a, blocked_id: a }), 'check');
  });
});

describe('activity_feedback', () => {
  it('records interactions with and without a target user', async () => {
    const a = await createUser();
    const b = await createUser();
    await db('activity_feedback').insert([
      { user_id: a, target_user_id: b, action: 'profile_view' },
      { user_id: a, target_user_id: b, action: 'rejection', reason: 'Location too far' },
      { user_id: a, action: 'feedback', reason: 'More profiles from my city please' },
    ]);
    const count = await db('activity_feedback').where({ user_id: a }).count({ n: '*' }).first();
    expect(Number(count.n)).toBe(3);
  });

  it('rejects unknown actions and self-targeted activity', async () => {
    const a = await createUser();
    await expectViolation(db('activity_feedback').insert({ user_id: a, action: 'like' }), 'check');
    await expectViolation(
      db('activity_feedback').insert({ user_id: a, target_user_id: a, action: 'profile_view' }),
      'check'
    );
  });
});

describe('login_verifications', () => {
  it('stores detection outcomes without any image column', async () => {
    const userId = await createUser();
    await db('login_verifications').insert({
      user_id: userId,
      verification_status: 'passed',
      detection_result: JSON.stringify({ face_detected: true, faces_count: 1 }),
      attempt_count: 1,
      attempted_at: new Date(),
      verified_at: new Date(),
    });

    const columns = Object.keys(await db('login_verifications').columnInfo());
    expect(columns.some((c) => /photo|image|picture|embedding/i.test(c))).toBe(false);
  });

  it('requires verified_at when passed and a valid status', async () => {
    const userId = await createUser();
    await expectViolation(
      db('login_verifications').insert({ user_id: userId, verification_status: 'passed' }),
      'check'
    );
    await expectViolation(
      db('login_verifications').insert({ user_id: userId, verification_status: 'recognised' }),
      'check'
    );
  });
});

describe('delete policy', () => {
  it('cascades owned data when a user with no interaction history is deleted', async () => {
    const userId = await createUser();
    const hobby = await db('hobbies').first();
    await db('profiles').insert({ user_id: userId, name: 'Temp' });
    await db('preferences').insert({ user_id: userId });
    await db('user_hobbies').insert({ user_id: userId, hobby_id: hobby.hobby_id });
    await db('quiz_answers').insert({ user_id: userId, question_id: 'q1', answer: 'a' });
    await db('login_verifications').insert({ user_id: userId });

    await db('users').where({ user_id: userId }).del();

    for (const table of ['profiles', 'preferences', 'user_hobbies', 'quiz_answers', 'login_verifications']) {
      const count = await db(table).where({ user_id: userId }).count({ n: '*' }).first();
      expect({ table, n: Number(count.n) }).toEqual({ table, n: 0 });
    }
  });

  it.each([
    ['messages', (a, b) => ({ sender_id: a, receiver_id: b, message: 'hi' })],
    ['connection_requests', (a, b) => ({ sender_id: a, receiver_id: b })],
    ['matches', (a, b) => ({ user1_id: a, user2_id: b, score: 50 })],
    ['reports', (a, b) => ({ reporter_id: a, reported_id: b, reason: 'x' })],
    ['blocks', (a, b) => ({ blocker_id: a, blocked_id: b })],
    ['activity_feedback', (a, b) => ({ user_id: a, target_user_id: b, action: 'interest' })],
  ])('blocks hard-deleting a user referenced by %s', async (table, makeRow) => {
    const a = await createUser();
    const b = await createUser();
    await db(table).insert(makeRow(a, b));
    await expectViolation(db('users').where({ user_id: a }).del(), 'referenced');
    await expectViolation(db('users').where({ user_id: b }).del(), 'referenced');
  });
});

describe('migrations', () => {
  it('roll back completely and re-apply from a clean database', async () => {
    await db.migrate.rollback(undefined, true);
    for (const table of APP_TABLES) {
      expect({ table, exists: await db.schema.hasTable(table) }).toEqual({ table, exists: false });
    }

    const [, applied] = await db.migrate.latest();
    expect(applied).toHaveLength(17);
    for (const table of APP_TABLES) {
      expect(await db.schema.hasTable(table)).toBe(true);
    }
    // ~28 DDL statements: can exceed Jest's 5 s default on a cold MySQL/MariaDB server.
  }, 60000);
});
