/**
 * Turns each login_verifications row into a short-lived verification session:
 * the temporary token issued after credentials/OTP succeed (stored as a
 * SHA-256 hash only), its expiry, and how the user authenticated.
 *
 * Columns are nullable so existing rows (none in practice) stay valid; the
 * application always sets them.
 */
const { isMysql } = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.alterTable('login_verifications', (table) => {
    table.string('token_hash', 64).nullable();
    table.datetime('expires_at', { useTz: true }).nullable();
    table.string('auth_method', 20).nullable();
    table.unique(['token_hash'], { indexName: 'uq_login_verifications_token_hash' });
  });
  await knex.raw(
    "ALTER TABLE login_verifications ADD CONSTRAINT chk_login_verifications_auth_method CHECK (auth_method IN ('password', 'otp'))"
  );
};

exports.down = async function down(knex) {
  const dropCheck = isMysql(knex)
    ? 'ALTER TABLE login_verifications DROP CONSTRAINT chk_login_verifications_auth_method'
    : 'ALTER TABLE login_verifications DROP CONSTRAINT IF EXISTS chk_login_verifications_auth_method';
  await knex.raw(dropCheck);
  await knex.schema.alterTable('login_verifications', (table) => {
    table.dropUnique(['token_hash'], 'uq_login_verifications_token_hash');
    table.dropColumn('token_hash');
    table.dropColumn('expires_at');
    table.dropColumn('auth_method');
  });
};
