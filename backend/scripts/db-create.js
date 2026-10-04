/**
 * Creates the configured database if it does not exist.
 *   npm run db:create                 -> creates DB_DATABASE
 *   node scripts/db-create.js <name>  -> creates <name>
 */
const knex = require('knex');
const config = require('../src/config/environment');
const { buildKnexConfig } = require('../src/config/database');

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

async function createDatabase(name, dbConfig = config.db) {
  if (!VALID_NAME.test(name || '')) {
    throw new Error(`Invalid database name "${name}"`);
  }

  const isMysql = buildKnexConfig(dbConfig).client === 'mysql2';
  // Connect to the server rather than the (possibly missing) database.
  const serverDb = knex(buildKnexConfig(dbConfig, { database: isMysql ? null : 'postgres' }));

  try {
    if (isMysql) {
      await serverDb.raw(
        'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        [name]
      );
      return true;
    }
    const { rows } = await serverDb.raw('SELECT 1 FROM pg_database WHERE datname = ?', [name]);
    const created = rows.length === 0;
    if (created) {
      // Inherits the server's encoding/locale (forcing UTF8 fails on clusters
      // initialised with another locale). The name is validated above.
      await serverDb.raw('CREATE DATABASE ??', [name]);
    }
    const { rows: enc } = await serverDb.raw(
      'SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = ?',
      [name]
    );
    if (enc[0].encoding !== 'UTF8') {
      console.warn(`Warning: database "${name}" uses ${enc[0].encoding}; UTF8 is recommended.`);
    }
    return created;
  } finally {
    await serverDb.destroy();
  }
}

module.exports = { createDatabase };

if (require.main === module) {
  const name = process.argv[2] || config.db.database;
  createDatabase(name)
    .then(() => console.log(`Database "${name}" is ready (${config.db.client}).`))
    .catch((err) => {
      console.error(`Could not create database "${name}": ${err.message || err.code}`);
      process.exit(1);
    });
}
