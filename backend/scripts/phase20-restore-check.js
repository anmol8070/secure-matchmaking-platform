/**
 * One-off isolated backup and restore rehearsal.
 * Uses a dedicated database name. Does not read the development database.
 * The machine has no mysqldump on PATH, so the dump is taken through the driver.
 */
const config = require('../src/config/environment');
const { buildKnexConfig } = require('../src/config/database');
const knex = require('knex');
const { createDatabase } = require('./db-create');

const NAME = 'phase20_restore_check';
const MARKER = 'phase20-restore-marker@example.com';

function rowsOf(result) {
  return Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result.rows || result;
}

async function main() {
  if (NAME === config.db.database) throw new Error('Refusing to use the configured application database');
  await createDatabase(NAME);
  const db = knex(buildKnexConfig(config.db, { database: NAME }));
  await db.migrate.latest();
  await db('users').insert({
    email: MARKER,
    password_hash: 'not-a-real-hash',
    role: 'user',
    status: 'active',
  });

  const tableRows = rowsOf(await db.raw('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']));
  const tableKey = Object.keys(tableRows[0]).find((key) => key.startsWith('Tables_in_'));
  const creates = [];
  for (const row of tableRows) {
    const table = row[tableKey];
    const created = rowsOf(await db.raw('SHOW CREATE TABLE ??', [table]))[0];
    creates.push(created['Create Table']);
  }
  const triggerRows = rowsOf(await db.raw('SHOW TRIGGERS'));
  const triggerSql = [];
  for (const trigger of triggerRows) {
    const created = rowsOf(await db.raw('SHOW CREATE TRIGGER ??', [trigger.Trigger]))[0];
    triggerSql.push(created['SQL Original Statement']);
  }
  const migrations = await db('knex_migrations').select('name', 'batch', 'migration_time');
  const marker = await db('users').where({ email: MARKER }).first();
  await db.destroy();

  const server = knex(buildKnexConfig(config.db, { database: null }));
  await server.raw('DROP DATABASE ??', [NAME]);
  await server.destroy();
  await createDatabase(NAME);

  const restored = knex(buildKnexConfig(config.db, { database: NAME }));
  await restored.raw('SET FOREIGN_KEY_CHECKS=0');
  for (const statement of creates) await restored.raw(statement);
  if (migrations.length) await restored('knex_migrations').insert(migrations);
  await restored('users').insert(marker);
  for (const statement of triggerSql) await restored.raw(statement);
  await restored.raw('SET FOREIGN_KEY_CHECKS=1');

  const afterMigrations = await restored('knex_migrations').count({ n: '*' }).first();
  const restoredMarker = await restored('users').where({ email: MARKER }).first();
  const newest = await restored('knex_migrations').orderBy('id', 'desc').first();
  const triggerCount = rowsOf(await restored.raw('SHOW TRIGGERS')).length;
  await restored.destroy();

  const cleanup = knex(buildKnexConfig(config.db, { database: null }));
  await cleanup.raw('DROP DATABASE ??', [NAME]);
  await cleanup.destroy();

  const ok = Number(afterMigrations.n) === migrations.length
    && restoredMarker
    && restoredMarker.email === marker.email
    && String(restoredMarker.user_id) === String(marker.user_id)
    && restoredMarker.password_hash === marker.password_hash;
  console.log(JSON.stringify({
    ok,
    client: config.db.client,
    database: NAME,
    tables: creates.length,
    migrations: migrations.length,
    newest: newest && newest.name,
    markerRestored: Boolean(restoredMarker && restoredMarker.email === MARKER),
    triggersBefore: triggerRows.length,
    triggersAfter: triggerCount,
    droppedAfterCheck: true,
  }));
  if (!ok || triggerRows.length !== triggerCount) process.exit(1);
}

main().catch((err) => {
  console.log(`RESTORE FAIL ${err.message}`);
  process.exit(1);
});
