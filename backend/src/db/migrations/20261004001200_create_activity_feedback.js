/**
 * activity_feedback — append-only interaction log feeding the adaptive
 * recommendation system. Weight calculation is implemented in a later phase.
 */
const {
  applyTableOptions,
  addTimestamps,
  userForeignKey,
  notSelfCheck,
  inCheck,
} = require('../schemaHelpers');

const ACTIONS = [
  'profile_view',
  'interest',
  'connection_request',
  'connection_accepted',
  'rejection',
  'feedback',
];

exports.up = async function up(knex) {
  await knex.schema.createTable('activity_feedback', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('id').primary();
    userForeignKey(table, 'user_id', { onDelete: 'RESTRICT' });
    // NULL for general feedback that is not about another user.
    userForeignKey(table, 'target_user_id', { onDelete: 'RESTRICT', nullable: true });
    table.string('action', 40).notNullable();
    table.text('reason').nullable();
    addTimestamps(knex, table, { updatedAt: false });

    inCheck(table, 'action', ACTIONS, 'chk_activity_feedback_action');
    notSelfCheck(table, 'user_id', 'target_user_id', 'chk_activity_feedback_not_self');

    // A user's recent activity (adaptive weights read this).
    table.index(['user_id', 'created_at'], 'idx_activity_feedback_user_created');
    table.index(['target_user_id'], 'idx_activity_feedback_target');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('activity_feedback');
};
