/**
 * user_hobbies — many-to-many link between users and hobbies.
 */
const { applyTableOptions, addTimestamps, userForeignKey } = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('user_hobbies', (table) => {
    applyTableOptions(knex, table);

    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' });
    table
      .integer('hobby_id')
      .unsigned()
      .notNullable()
      .references('hobby_id')
      .inTable('hobbies')
      // A hobby still assigned to users cannot be deleted — deactivate it instead.
      .onDelete('RESTRICT')
      .onUpdate('RESTRICT');
    addTimestamps(knex, table, { updatedAt: false });

    // Composite PK prevents assigning the same hobby to a user twice
    // and serves lookups by user_id.
    table.primary(['user_id', 'hobby_id'], 'pk_user_hobbies');
    // "Which users share hobby X" (matching engine).
    table.index(['hobby_id'], 'idx_user_hobbies_hobby');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('user_hobbies');
};
