/**
 * preferences — 1:1 with users. The user's own food/lifestyle choices and what
 * they look for in a partner. partner_preferences (JSON) keeps the structure
 * open for the matching engine without schema changes.
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('preferences', (table) => {
    applyTableOptions(knex, table);

    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' }).primary();
    table.string('food_preference', 50).nullable();
    table.string('lifestyle_preference', 100).nullable();
    table.string('preferred_location', 150).nullable();
    table.smallint('partner_min_age').unsigned().nullable();
    table.smallint('partner_max_age').unsigned().nullable();
    // e.g. { "genders": [...], "education": [...], "occupation": [...] }
    table.jsonb('partner_preferences').nullable();
    addTimestamps(knex, table);

    table.check('?? >= 18', ['partner_min_age'], 'chk_preferences_min_age');
    table.check('?? <= 120', ['partner_max_age'], 'chk_preferences_max_age');
    table.check(
      '?? IS NULL OR ?? IS NULL OR ?? <= ??',
      ['partner_min_age', 'partner_max_age', 'partner_min_age', 'partner_max_age'],
      'chk_preferences_age_range'
    );
  });

  await maintainUpdatedAt(knex, 'preferences');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('preferences');
};
