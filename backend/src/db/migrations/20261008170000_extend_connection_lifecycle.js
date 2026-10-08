/**
 * Phase 10: full connection lifecycle.
 *
 * connection_requests
 *   - status adds 'cancelled' (sender withdrew a pending request) and
 *     'disconnected' (an accepted connection was removed). Rows are never
 *     deleted, so the history stays available for auditing and ML.
 *   - pair_low_id / pair_high_id: stored generated columns (LEAST/GREATEST of
 *     sender and receiver) with a UNIQUE index, so two users share at most ONE
 *     row regardless of direction. This blocks reverse duplicates (A→B and
 *     B→A) and concurrent double-inserts at the database level.
 *   - responded_at: when the receiver accepted/rejected (connectedAt).
 *
 * activity_feedback
 *   - action adds 'connection_cancelled' and 'connection_removed'.
 *   - connection_request_id: optional link from an interaction event to the
 *     request it concerns (SET NULL keeps events if a request row is purged).
 */
const { isPostgres } = require('../schemaHelpers');

const OLD_CONNECTION_STATUSES = ['pending', 'accepted', 'rejected'];
const NEW_CONNECTION_STATUSES = [...OLD_CONNECTION_STATUSES, 'cancelled', 'disconnected'];

const OLD_ACTIONS = ['profile_view', 'interest', 'connection_request', 'connection_accepted', 'rejection', 'feedback'];
const NEW_ACTIONS = [...OLD_ACTIONS, 'connection_cancelled', 'connection_removed'];

/** Replaces a table-level CHECK (column IN (...)) constraint. */
async function replaceInCheck(knex, table, column, name, values) {
  await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', [table, name]);
  const placeholders = values.map(() => '?').join(', ');
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IN (${placeholders}))`, [
    table,
    name,
    column,
    ...values,
  ]);
}

exports.up = async function up(knex) {
  await replaceInCheck(knex, 'connection_requests', 'status', 'chk_connection_requests_status', NEW_CONNECTION_STATUSES);

  const idType = isPostgres(knex) ? 'BIGINT' : 'BIGINT UNSIGNED';
  for (const [column, fn] of [
    ['pair_low_id', 'LEAST'],
    ['pair_high_id', 'GREATEST'],
  ]) {
    await knex.raw(
      `ALTER TABLE ?? ADD COLUMN ?? ${idType} GENERATED ALWAYS AS (${fn}(??, ??)) STORED`,
      ['connection_requests', column, 'sender_id', 'receiver_id']
    );
  }

  await knex.schema.alterTable('connection_requests', (table) => {
    table.datetime('responded_at', { useTz: true }).nullable();
    table.unique(['pair_low_id', 'pair_high_id'], { indexName: 'uq_connection_requests_user_pair' });
    // "My connections" and "sent requests" filtered by status.
    table.index(['sender_id', 'status'], 'idx_connection_requests_sender_status');
  });

  await replaceInCheck(knex, 'activity_feedback', 'action', 'chk_activity_feedback_action', NEW_ACTIONS);

  await knex.schema.alterTable('activity_feedback', (table) => {
    table
      .bigInteger('connection_request_id')
      .unsigned()
      .nullable()
      .references('request_id')
      .inTable('connection_requests')
      .onDelete('SET NULL')
      .onUpdate('RESTRICT');
    table.index(['connection_request_id'], 'idx_activity_feedback_connection_request');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('activity_feedback', (table) => {
    table.dropForeign(['connection_request_id']);
    table.dropIndex(['connection_request_id'], 'idx_activity_feedback_connection_request');
    table.dropColumn('connection_request_id');
  });
  await knex('activity_feedback').whereIn('action', ['connection_cancelled', 'connection_removed']).del();
  await replaceInCheck(knex, 'activity_feedback', 'action', 'chk_activity_feedback_action', OLD_ACTIONS);

  await knex.schema.alterTable('connection_requests', (table) => {
    table.dropIndex(['sender_id', 'status'], 'idx_connection_requests_sender_status');
    table.dropUnique(['pair_low_id', 'pair_high_id'], 'uq_connection_requests_user_pair');
    table.dropColumn('responded_at');
  });
  await knex.schema.alterTable('connection_requests', (table) => {
    table.dropColumn('pair_high_id');
    table.dropColumn('pair_low_id');
  });

  // The old schema has no cancelled/disconnected states; both end the relationship.
  await knex('connection_requests').whereIn('status', ['cancelled', 'disconnected']).update({ status: 'rejected' });
  await replaceInCheck(knex, 'connection_requests', 'status', 'chk_connection_requests_status', OLD_CONNECTION_STATUSES);
};
