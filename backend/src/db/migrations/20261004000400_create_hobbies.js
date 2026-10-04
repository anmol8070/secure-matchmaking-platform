/**
 * hobbies — master list of hobbies/interests managed by admins.
 * Retire a hobby with status = 'inactive' rather than deleting it.
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  inCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('hobbies', (table) => {
    applyTableOptions(knex, table);

    table.increments('hobby_id').primary();
    table.string('hobby_name', 100).notNullable().unique('uq_hobbies_name');
    table.string('status', 20).notNullable().defaultTo('active');
    addTimestamps(knex, table);

    inCheck(table, 'status', ['active', 'inactive'], 'chk_hobbies_status');
    table.check('CHAR_LENGTH(??) > 0', ['hobby_name'], 'chk_hobbies_name_not_empty');
  });

  await maintainUpdatedAt(knex, 'hobbies');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('hobbies');
};
