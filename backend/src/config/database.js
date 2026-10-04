/**
 * Database configuration layer.
 *
 * Uses Knex as a query builder so the application can run on PostgreSQL or
 * MySQL/MariaDB by changing DB_CLIENT only. The schema lives in
 * src/db/migrations and is applied with `npm run db:migrate`.
 */
const path = require('path');
const knex = require('knex');
const config = require('./environment');
const logger = require('../utils/logger');

const CLIENT_DRIVERS = {
  postgres: { driver: 'pg', defaultPort: 5432 },
  postgresql: { driver: 'pg', defaultPort: 5432 },
  mysql: { driver: 'mysql2', defaultPort: 3306 },
};

const DB_DIR = path.resolve(__dirname, '../db');

let instance = null;
let pgTypesConfigured = false;

/**
 * pg returns BIGINT and NUMERIC as strings by default. Our ids are BIGINT and
 * match scores are NUMERIC(5,2); both fit safely in a JS number.
 */
function configurePgTypes() {
  if (pgTypesConfigured) return;
  const { types } = require('pg');
  types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
  types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));
  pgTypesConfigured = true;
}

/**
 * Builds a Knex config object.
 * @param {object} dbConfig  database settings (defaults to env config)
 * @param {object} [options]
 * @param {string|null} [options.database]  override the database name; null connects to the server only
 */
function buildKnexConfig(dbConfig = config.db, options = {}) {
  const clientInfo = CLIENT_DRIVERS[dbConfig.client];
  if (!clientInfo) {
    throw new Error(
      `Unsupported DB_CLIENT "${dbConfig.client}". Use one of: ${Object.keys(CLIENT_DRIVERS).join(', ')}`
    );
  }

  const isMysql = clientInfo.driver === 'mysql2';
  const database = options.database !== undefined ? options.database : dbConfig.database;

  let connection;
  if (dbConfig.url) {
    let url = dbConfig.url;
    if (options.database !== undefined) {
      // Drivers let the URL path win over a `database` field, so rewrite the path.
      const parsed = new URL(dbConfig.url);
      parsed.pathname = `/${database || ''}`;
      url = parsed.toString();
    }
    // pg understands `connectionString`, mysql2 understands `uri`
    connection = isMysql ? { uri: url } : { connectionString: url };
  } else {
    connection = {
      host: dbConfig.host,
      port: dbConfig.port || clientInfo.defaultPort,
      database: database || undefined,
      user: dbConfig.username,
      password: dbConfig.password,
    };
  }

  const pool = { min: dbConfig.poolMin, max: dbConfig.poolMax };

  if (isMysql) {
    // Store and read all DATETIME values as UTC; return DECIMAL as numbers.
    Object.assign(connection, { timezone: 'Z', charset: 'utf8mb4', decimalNumbers: true });
    pool.afterCreate = (conn, done) => {
      conn.query("SET time_zone = '+00:00'", (err) => done(err, conn));
    };
  } else {
    configurePgTypes();
  }

  return {
    client: clientInfo.driver,
    connection,
    pool,
    migrations: {
      directory: path.join(DB_DIR, 'migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.join(DB_DIR, 'seeds'),
    },
  };
}

function isConfigured(dbConfig = config.db) {
  return Boolean(dbConfig.url || (dbConfig.host && dbConfig.database));
}

/** Returns the shared Knex instance, creating it lazily on first use. */
function getDb() {
  if (!instance) {
    instance = knex(buildKnexConfig());
  }
  return instance;
}

/** Runs a trivial query to confirm the database is reachable. */
async function testConnection() {
  if (!isConfigured()) {
    logger.warn('Database is not configured — set DB_* or DATABASE_URL in .env');
    return false;
  }
  try {
    await getDb().raw('SELECT 1');
    logger.info(`Database connection established (${config.db.client})`);
    return true;
  } catch (err) {
    // Network errors (e.g. ECONNREFUSED) can arrive as an AggregateError with an empty message
    logger.warn(`Database connection failed: ${err.message || err.code || err.name}`);
    return false;
  }
}

async function closeConnection() {
  if (instance) {
    await instance.destroy();
    instance = null;
  }
}

module.exports = {
  buildKnexConfig,
  isConfigured,
  getDb,
  testConnection,
  closeConnection,
};
