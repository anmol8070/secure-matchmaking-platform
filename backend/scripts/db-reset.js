/**
 * Development helper: roll back every migration, re-apply them and re-seed.
 * Destroys all data in DB_DATABASE, so it refuses to run in production.
 */
const knex = require('knex');
const config = require('../src/config/environment');
const { buildKnexConfig } = require('../src/config/database');

async function main() {
  if (config.isProduction) {
    throw new Error('db:reset is disabled when NODE_ENV=production');
  }

  const db = knex(buildKnexConfig());
  try {
    await db.migrate.rollback(undefined, true);
    const [, applied] = await db.migrate.latest();
    await db.seed.run();
    console.log(`Reset "${config.db.database}": ${applied.length} migrations applied, seeds run.`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
