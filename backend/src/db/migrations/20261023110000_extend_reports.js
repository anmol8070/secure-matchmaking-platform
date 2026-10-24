/**
 * Phase 13: structured user reports on the existing reports table.
 *
 *   - reason becomes a validated category code (CHECK):
 *       harassment | spam | fake_profile | inappropriate_content | threatening | other
 *     Existing free-text reasons are kept: they move into the new description
 *     column and the reason becomes 'other' (no report is lost).
 *   - description: optional details from the reporter (≤ 2000 characters).
 *   - resolution_note / action_taken: written by moderators in the Admin
 *     Panel (Phase 14); reviewed_by / reviewed_at already exist.
 *   - idx_reports_duplicate: finds an open report by the same reporter about
 *     the same user for the same reason (duplicate submissions).
 */
const CATEGORIES = ['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'threatening', 'other'];
const ACTIONS = ['none', 'warning', 'content_removed', 'suspended', 'banned'];

exports.up = async function up(knex) {
  await knex.schema.alterTable('reports', (table) => {
    table.text('description').nullable();
    table.text('resolution_note').nullable();
    table.string('action_taken', 30).nullable();
  });

  // Keep old free-text reasons as descriptions; their category becomes "other".
  await knex('reports').whereNotIn('reason', CATEGORIES).update({ description: knex.ref('reason'), reason: 'other' });

  // reason was TEXT: make it a short code with a CHECK.
  await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', ['reports', 'chk_reports_reason_not_empty']);
  await knex.schema.alterTable('reports', (table) => {
    table.string('reason', 30).notNullable().alter();
  });
  const list = (values) => values.map(() => '?').join(', ');
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IN (${list(CATEGORIES)}))`, ['reports', 'chk_reports_reason', 'reason', ...CATEGORIES]);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IS NULL OR ?? IN (${list(ACTIONS)}))`, [
    'reports',
    'chk_reports_action_taken',
    'action_taken',
    'action_taken',
    ...ACTIONS,
  ]);
  await knex.raw('ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IS NULL OR CHAR_LENGTH(??) <= 2000)', [
    'reports',
    'chk_reports_description_length',
    'description',
    'description',
  ]);
  await knex.schema.alterTable('reports', (table) => {
    table.index(['reporter_id', 'reported_id', 'reason', 'status'], 'idx_reports_duplicate');
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('reports', (table) => {
    table.dropIndex(['reporter_id', 'reported_id', 'reason', 'status'], 'idx_reports_duplicate');
  });
  for (const name of ['chk_reports_description_length', 'chk_reports_action_taken', 'chk_reports_reason']) {
    await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', ['reports', name]);
  }
  await knex.schema.alterTable('reports', (table) => {
    table.text('reason').notNullable().alter();
  });
  // Put the details back into reason so nothing is lost on rollback.
  await knex('reports').whereNotNull('description').update({ reason: knex.ref('description') });
  await knex.raw('ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (CHAR_LENGTH(??) > 0)', ['reports', 'chk_reports_reason_not_empty', 'reason']);
  await knex.schema.alterTable('reports', (table) => {
    table.dropColumn('action_taken');
    table.dropColumn('resolution_note');
    table.dropColumn('description');
  });
};
