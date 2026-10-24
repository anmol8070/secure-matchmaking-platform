/**
 * Phase 14: admin audit log + indexes for dashboard/monitoring aggregates.
 *
 * admin_audit_logs — append-only record of sensitive admin actions
 * (account suspended/reactivated, report status changed, ML training run).
 * The application only ever INSERTs and SELECTs; there is no update or
 * delete path. It never stores passwords, OTPs, tokens or message text —
 * only ids, the action, a short reason and small metadata (e.g. the
 * previous and new status, a related report id).
 *
 * admin_id uses SET NULL so removing an admin account never deletes history.
 *
 * Indexes: the dashboard and activity charts count rows per status and per
 * day; these indexes keep those COUNT(*) / GROUP BY DATE(...) queries off
 * full table scans as the tables grow.
 */
const { applyTableOptions, userForeignKey, inCheck } = require('../schemaHelpers');

const ACTIONS = ['user_suspended', 'user_reactivated', 'report_status_changed', 'ml_training_run'];
const TARGETS = ['user', 'report', 'ml_model'];

exports.up = async function up(knex) {
  await knex.schema.createTable('admin_audit_logs', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('audit_id').primary();
    userForeignKey(table, 'admin_id', { onDelete: 'SET NULL', nullable: true });
    table.string('action', 40).notNullable();
    table.string('target_type', 20).notNullable();
    table.bigInteger('target_id').unsigned().nullable();
    table.string('reason', 500).nullable();
    table.json('metadata').nullable();
    table.datetime('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    inCheck(table, 'action', ACTIONS, 'chk_admin_audit_action');
    inCheck(table, 'target_type', TARGETS, 'chk_admin_audit_target_type');

    table.index(['created_at'], 'idx_admin_audit_created');
    table.index(['target_type', 'target_id', 'created_at'], 'idx_admin_audit_target');
    table.index(['admin_id', 'created_at'], 'idx_admin_audit_admin');
  });

  await knex.schema.alterTable('users', (table) => {
    table.index(['status', 'created_at'], 'idx_users_status_created');
    table.index(['created_at'], 'idx_users_created');
  });
  await knex.schema.alterTable('messages', (table) => {
    table.index(['sent_at'], 'idx_messages_sent_at');
  });
  await knex.schema.alterTable('connection_requests', (table) => {
    table.index(['created_at'], 'idx_connection_requests_created');
    table.index(['status', 'responded_at'], 'idx_connection_requests_status_responded');
  });
  await knex.schema.alterTable('video_calls', (table) => {
    table.index(['created_at'], 'idx_video_calls_created');
  });
  await knex.schema.alterTable('reports', (table) => {
    table.index(['reviewed_at'], 'idx_reports_reviewed');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('reports', (table) => table.dropIndex(['reviewed_at'], 'idx_reports_reviewed'));
  await knex.schema.alterTable('video_calls', (table) => table.dropIndex(['created_at'], 'idx_video_calls_created'));
  await knex.schema.alterTable('connection_requests', (table) => {
    table.dropIndex(['status', 'responded_at'], 'idx_connection_requests_status_responded');
    table.dropIndex(['created_at'], 'idx_connection_requests_created');
  });
  await knex.schema.alterTable('messages', (table) => table.dropIndex(['sent_at'], 'idx_messages_sent_at'));
  await knex.schema.alterTable('users', (table) => {
    table.dropIndex(['created_at'], 'idx_users_created');
    table.dropIndex(['status', 'created_at'], 'idx_users_status_created');
  });
  await knex.schema.dropTableIfExists('admin_audit_logs');
};
