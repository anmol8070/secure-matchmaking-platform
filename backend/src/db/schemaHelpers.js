/**
 * Shared helpers for migrations so every table follows the same conventions
 * on both PostgreSQL and MySQL/MariaDB.
 *
 * NOTE: this file must stay outside src/db/migrations — Knex treats every
 * file in that folder as a migration.
 */

const isPostgres = (knex) => knex.client.dialect === 'postgresql';
const isMysql = (knex) => knex.client.dialect === 'mysql';

/** InnoDB + utf8mb4 on MySQL (ignored on PostgreSQL). */
function applyTableOptions(knex, table) {
  if (isMysql(knex)) {
    table.engine('InnoDB');
    table.charset('utf8mb4');
    table.collate('utf8mb4_unicode_ci');
  }
}

/** created_at / updated_at — TIMESTAMPTZ on PostgreSQL, DATETIME (UTC) on MySQL. */
function addTimestamps(knex, table, { updatedAt = true } = {}) {
  table.datetime('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  if (updatedAt) {
    table.datetime('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  }
}

/**
 * Makes the database maintain updated_at on every UPDATE:
 * a BEFORE UPDATE trigger on PostgreSQL, ON UPDATE CURRENT_TIMESTAMP on MySQL.
 * Call after the table has been created.
 */
async function maintainUpdatedAt(knex, tableName) {
  if (isPostgres(knex)) {
    await knex.raw(
      'CREATE TRIGGER ?? BEFORE UPDATE ON ?? FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      [`trg_${tableName}_updated_at`, tableName]
    );
  } else {
    await knex.raw(
      'ALTER TABLE ?? MODIFY updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      [tableName]
    );
  }
}

/**
 * Adds a BIGINT column referencing users.user_id.
 *
 * ON UPDATE is always RESTRICT: user_id is a surrogate key and never changes.
 * ON DELETE is chosen per table — see docs/database-schema.md ("Delete policy").
 */
function userForeignKey(table, column, { onDelete, nullable = false }) {
  const col = table.bigInteger(column).unsigned();
  if (nullable) col.nullable();
  else col.notNullable();
  col.references('user_id').inTable('users').onDelete(onDelete).onUpdate('RESTRICT');
  return col;
}

/**
 * Table-level CHECK (column IN (...)) used for status/enum-like columns.
 * Column-level named CHECKs (knex `.checkIn`) are not supported by MariaDB,
 * so all CHECK constraints are declared at table level.
 */
function inCheck(table, column, values, name) {
  const placeholders = values.map(() => '?').join(', ');
  table.check(`?? IN (${placeholders})`, [column, ...values], name);
}

/** CHECK (a <> b) — prevents a user from relating to themselves. */
function notSelfCheck(table, columnA, columnB, name) {
  table.check('?? <> ??', [columnA, columnB], name);
}

module.exports = {
  isPostgres,
  isMysql,
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
  notSelfCheck,
  inCheck,
};
