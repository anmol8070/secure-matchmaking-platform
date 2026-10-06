/**
 * Phase 6: preferred education and occupation as structured columns (Phase 2
 * left them inside the partner_preferences JSON). Structured values let the
 * future compatibility engine compare them field by field.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('preferences', (table) => {
    table.string('preferred_education', 150).nullable();
    table.string('preferred_occupation', 150).nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('preferences', (table) => {
    table.dropColumn('preferred_education');
    table.dropColumn('preferred_occupation');
  });
};
