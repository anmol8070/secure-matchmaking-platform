/**
 * PostgreSQL only: trigger function that keeps updated_at current.
 * MySQL uses ON UPDATE CURRENT_TIMESTAMP instead (see schemaHelpers.maintainUpdatedAt).
 */
const { isPostgres } = require('../schemaHelpers');

exports.up = async function up(knex) {
  if (!isPostgres(knex)) return;
  await knex.raw(`
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

exports.down = async function down(knex) {
  if (!isPostgres(knex)) return;
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at()');
};
