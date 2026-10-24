/**
 * Optional reason chosen when a member blocks someone. Older blocks stay
 * valid with a null reason.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('blocks', (table) => {
    table.string('reason', 40).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('blocks', (table) => {
    table.dropColumn('reason');
  });
};
