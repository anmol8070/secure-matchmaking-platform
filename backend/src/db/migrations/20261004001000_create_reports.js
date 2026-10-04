/**
 * reports — user-submitted reports reviewed in the Admin Panel.
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
  notSelfCheck,
  inCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('reports', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('report_id').primary();
    userForeignKey(table, 'reporter_id', { onDelete: 'RESTRICT' });
    userForeignKey(table, 'reported_id', { onDelete: 'RESTRICT' });
    table.text('reason').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    // Admin who handled the report; kept as NULL if that admin account is removed.
    userForeignKey(table, 'reviewed_by', { onDelete: 'SET NULL', nullable: true });
    table.datetime('reviewed_at', { useTz: true }).nullable();
    addTimestamps(knex, table);

    inCheck(
      table,
      'status',
      ['pending', 'under_review', 'resolved', 'dismissed'],
      'chk_reports_status'
    );
    notSelfCheck(table, 'reporter_id', 'reported_id', 'chk_reports_not_self');
    table.check('CHAR_LENGTH(??) > 0', ['reason'], 'chk_reports_reason_not_empty');

    table.index(['reporter_id'], 'idx_reports_reporter');
    table.index(['reported_id'], 'idx_reports_reported');
    // Admin moderation queue: open reports, oldest first.
    table.index(['status', 'created_at'], 'idx_reports_status_created');
  });

  await maintainUpdatedAt(knex, 'reports');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('reports');
};
