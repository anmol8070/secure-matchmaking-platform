/**
 * blocks — user A has blocked user B. Used later by recommendation, privacy
 * and communication modules to hide/deny interaction in both directions.
 */
const {
  applyTableOptions,
  addTimestamps,
  userForeignKey,
  notSelfCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('blocks', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('block_id').primary();
    userForeignKey(table, 'blocker_id', { onDelete: 'RESTRICT' });
    userForeignKey(table, 'blocked_id', { onDelete: 'RESTRICT' });
    addTimestamps(knex, table, { updatedAt: false });

    notSelfCheck(table, 'blocker_id', 'blocked_id', 'chk_blocks_not_self');

    // No duplicate blocks; also serves "who have I blocked" (blocker_id prefix).
    table.unique(['blocker_id', 'blocked_id'], { indexName: 'uq_blocks_pair' });
    // "Who has blocked me" — needed to exclude blockers from my recommendations.
    table.index(['blocked_id'], 'idx_blocks_blocked');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('blocks');
};
