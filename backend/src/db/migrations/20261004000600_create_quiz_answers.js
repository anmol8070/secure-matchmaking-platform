/**
 * quiz_answers — optional compatibility-question answers.
 * question_id is a stable key for a question defined by the quiz module
 * (a questions table can be introduced later without changing this one).
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('quiz_answers', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('id').primary();
    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' });
    table.string('question_id', 64).notNullable();
    table.text('answer').notNullable();
    addTimestamps(knex, table);

    // One answer per question per user; also serves lookups by user_id.
    table.unique(['user_id', 'question_id'], { indexName: 'uq_quiz_answers_user_question' });
  });

  await maintainUpdatedAt(knex, 'quiz_answers');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('quiz_answers');
};
