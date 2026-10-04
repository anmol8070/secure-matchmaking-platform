/**
 * matches — compatibility results produced by the matching engine.
 *
 * Directional: the score is computed for user1 (the viewer) about user2
 * (the candidate), because adaptive weights are per user. A→B and B→A may
 * therefore hold different scores. Values are written only by the engine —
 * nothing is hard-coded here.
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
  notSelfCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('matches', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('match_id').primary();
    userForeignKey(table, 'user1_id', { onDelete: 'RESTRICT' });
    userForeignKey(table, 'user2_id', { onDelete: 'RESTRICT' });
    table.decimal('score', 5, 2).notNullable();
    // Per-attribute scores, e.g. { "location": 20, "education": 15, "hobbies": 12, ... }
    table.jsonb('score_breakdown').nullable();
    addTimestamps(knex, table);

    notSelfCheck(table, 'user1_id', 'user2_id', 'chk_matches_not_self');
    table.check('?? >= 0 AND ?? <= 100', ['score', 'score'], 'chk_matches_score_range');

    // One result per (viewer, candidate); also serves lookups by user1_id.
    table.unique(['user1_id', 'user2_id'], { indexName: 'uq_matches_pair' });
    table.index(['user2_id'], 'idx_matches_user2');
  });

  await maintainUpdatedAt(knex, 'matches');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('matches');
};
