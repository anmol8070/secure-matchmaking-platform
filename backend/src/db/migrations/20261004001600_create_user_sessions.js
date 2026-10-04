/**
 * user_sessions — one row per issued access token (JWT).
 *
 * The JWT carries the session's random `token_id` as its `jti`. The auth
 * middleware checks this row on every request, so logout (revoked_at) and
 * account suspension take effect immediately instead of waiting for the JWT
 * to expire.
 */
const { applyTableOptions, addTimestamps, userForeignKey } = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('user_sessions', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('session_id').primary();
    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' });
    table.string('token_id', 64).notNullable();
    // The live verification that completed this login (audit trail).
    table
      .bigInteger('login_verification_id')
      .unsigned()
      .nullable()
      .references('verification_id')
      .inTable('login_verifications')
      .onDelete('SET NULL')
      .onUpdate('RESTRICT');
    table.datetime('expires_at', { useTz: true }).notNullable();
    table.datetime('revoked_at', { useTz: true }).nullable();
    addTimestamps(knex, table, { updatedAt: false });

    table.unique(['token_id'], { indexName: 'uq_user_sessions_token_id' });
    table.index(['user_id', 'created_at'], 'idx_user_sessions_user_created');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_sessions');
};
