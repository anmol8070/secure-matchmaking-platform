/**
 * profiles — 1:1 with users. Public profile shown to other members.
 *
 * profile_photo_url is the user's chosen display picture (gallery/upload/camera).
 * It is deliberately unrelated to login verification (see login_verifications).
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('profiles', (table) => {
    applyTableOptions(knex, table);

    // Owned data: removed together with the user row.
    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' }).primary();
    table.string('name', 100).notNullable();
    // Age is derived from date_of_birth so it never goes stale.
    table.date('date_of_birth').nullable();
    table.string('gender', 30).nullable();
    table.string('city', 100).nullable();
    table.string('state', 100).nullable();
    table.string('country', 100).nullable();
    table.string('education', 150).nullable();
    table.string('occupation', 150).nullable();
    table.string('lifestyle', 100).nullable();
    table.text('bio').nullable();
    table.string('profile_photo_url', 512).nullable();
    addTimestamps(knex, table);

    table.check('CHAR_LENGTH(??) > 0', ['name'], 'chk_profiles_name_not_empty');
    table.check('CHAR_LENGTH(??) <= 2000', ['bio'], 'chk_profiles_bio_length');

    // Candidate filtering by location (matching engine).
    table.index(['country', 'state', 'city'], 'idx_profiles_location');
  });

  await maintainUpdatedAt(knex, 'profiles');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('profiles');
};
