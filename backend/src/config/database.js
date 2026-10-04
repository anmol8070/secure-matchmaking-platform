/**
 * Database configuration layer.
 *
 * Uses Knex as a query builder so the application can run on PostgreSQL or
 * MySQL by changing DB_CLIENT only. Application tables are created in Phase 2.
 */
const knex = require('knex');
const config = require('./env');
const logger = require('../utils/logger');

const CLIENT_DRIVERS = {
  postgres: { driver: 'pg', defaultPort: 5432 },
  postgresql: { driver: 'pg', defaultPort: 5432 },
  mysql: { driver: 'mysql2', defaultPort: 3306 },
};

let instance = null;

function buildKnexConfig(dbConfig = config.db) {
  const clientInfo = CLIENT_DRIVERS[dbConfig.client];
  if (!clientInfo) {
    throw new Error(
      `Unsupported DB_CLIENT "${dbConfig.client}". Use one of: ${Object.keys(CLIENT_DRIVERS).join(', ')}`
    );
  }

  const connection = dbConfig.url
    ? dbConfig.url
    : {
        host: dbConfig.host,
        port: dbConfig.port || clientInfo.defaultPort,
        database: dbConfig.database,
        user: dbConfig.username,
        password: dbConfig.password,
      };

  return {
    client: clientInfo.driver,
    connection,
    pool: { min: dbConfig.poolMin, max: dbConfig.poolMax },
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
