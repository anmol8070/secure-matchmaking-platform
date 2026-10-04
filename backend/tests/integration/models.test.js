/**
 * Phase 3 database integration: shared connection, models and enum constants.
 * Runs against DB_TEST_DATABASE (see schema.test.js). Run with: npm run test:db
 */
process.env.NODE_ENV = 'test';

const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
// Point the shared connection module at the test database before it is loaded.
config.db.database = TEST_DB;

const { getDb, testConnection, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const models = require('../../src/models');
const ENUMS = require('../../src/constants/enums');

let db;
let seq = 0;

async function newUserId(overrides = {}) {
  seq += 1;
  const user = { email: `m${seq}_${Date.now()}@example.com`, ...overrides };
  // pg needs RETURNING and gives [{ user_id }]; mysql has no RETURNING and gives [insertId]
  if (db.client.dialect === 'postgresql') {
    const [row] = await db('users').insert(user, ['user_id']);
    return row.user_id;
  }
  const [insertId] = await db('users').insert(user);
  return insertId;
}

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
  await db.seed.run();
}, 60000);

afterAll(async () => {
  await closeConnection();
});

describe('database connection module', () => {
  it('connects using the environment configuration', async () => {
    expect(await testConnection()).toBe(true);
  });

  it('reuses a single pooled connection instance', () => {
    expect(getDb()).toBe(db);
    expect(db.client.pool).toBeDefined();
  });
});

describe('models', () => {
  it.each(Object.entries(models))('%s maps to an existing table and primary key', async (name, model) => {
    const columns = Object.keys(await db(model.table).columnInfo());
    const keys = Array.isArray(model.primaryKey) ? model.primaryKey : [model.primaryKey];

    expect(columns.length).toBeGreaterThan(0);
    for (const key of keys) expect(columns).toContain(key);
    for (const jsonColumn of model.jsonColumns) expect(columns).toContain(jsonColumn);
  });

  it('finds rows by primary key and parses JSON columns', async () => {
    const userId = await newUserId();
    await db('preferences').insert({
      user_id: userId,
      partner_preferences: JSON.stringify({ genders: ['any'] }),
    });

    const prefs = await models.Preference.findByPk(userId);
    expect(prefs.partner_preferences).toEqual({ genders: ['any'] });

    const hobby = await models.Hobby.query().first();
    await db('user_hobbies').insert({ user_id: userId, hobby_id: hobby.hobby_id });
    const link = await models.UserHobby.findByPk({ user_id: userId, hobby_id: hobby.hobby_id });
    expect(link).toMatchObject({ user_id: userId, hobby_id: hobby.hobby_id });

    expect(await models.User.findByPk(999999999)).toBeUndefined();
  });
});

describe('enum constants match the database CHECK constraints', () => {
  it('USER_ROLES and USER_STATUSES', async () => {
    for (const role of ENUMS.USER_ROLES) await newUserId({ role });
    for (const status of ENUMS.USER_STATUSES) await newUserId({ status });
  });

  it('HOBBY_STATUSES', async () => {
    for (const status of ENUMS.HOBBY_STATUSES) {
      await db('hobbies').insert({ hobby_name: `enum-test-${status}-${Date.now()}`, status });
    }
  });

  it('CONNECTION_STATUSES, REPORT_STATUSES and ACTIVITY_ACTIONS', async () => {
    const a = await newUserId();
    for (const status of ENUMS.CONNECTION_STATUSES) {
      await db('connection_requests').insert({ sender_id: a, receiver_id: await newUserId(), status });
    }
    for (const status of ENUMS.REPORT_STATUSES) {
      await db('reports').insert({ reporter_id: a, reported_id: await newUserId(), reason: 'test', status });
    }
    for (const action of ENUMS.ACTIVITY_ACTIONS) {
      await db('activity_feedback').insert({ user_id: a, target_user_id: await newUserId(), action });
    }
  });

  it('VERIFICATION_STATUSES', async () => {
    const userId = await newUserId();
    for (const status of ENUMS.VERIFICATION_STATUSES) {
      await db('login_verifications').insert({
        user_id: userId,
        verification_status: status,
        verified_at: status === 'passed' ? new Date() : null,
      });
    }
  });
});
