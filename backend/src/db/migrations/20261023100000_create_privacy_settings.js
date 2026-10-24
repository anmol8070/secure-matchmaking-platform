/**
 * privacy_settings — who may see which parts of a user's profile (Phase 13).
 *
 * One row per user (user_id is the PK). A user without a row gets the
 * defaults below (services/privacyService.js applies them), so no backfill
 * is needed. Each *_visibility column is one of:
 *   everyone    — any signed-in member allowed to see the profile
 *   connections — only accepted connections (and the user)
 *   nobody      — only the user
 * profile_visibility is everyone | connections: "connections" hides the
 * profile from recommendations/match details for non-connections and shows
 * them only the name (and photo, if its own setting allows).
 *
 * Name and gender are always visible (needed to identify a member). Email,
 * mobile, date of birth, password/OTP/session data are never part of any
 * public profile, whatever the settings. No secrets are stored here.
 */
const { applyTableOptions, addTimestamps, maintainUpdatedAt, userForeignKey, inCheck } = require('../schemaHelpers');

const FIELD_COLUMNS = {
  photo_visibility: 'everyone',
  age_visibility: 'everyone',
  location_visibility: 'everyone',
  education_visibility: 'everyone',
  occupation_visibility: 'everyone',
  lifestyle_visibility: 'everyone',
  bio_visibility: 'everyone',
  hobbies_visibility: 'everyone',
  online_status_visibility: 'connections',
};

exports.up = async function up(knex) {
  await knex.schema.createTable('privacy_settings', (table) => {
    applyTableOptions(knex, table);

    // Owned data: removed together with the user.
    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' }).primary();
    table.string('profile_visibility', 20).notNullable().defaultTo('everyone');
    for (const [column, fallback] of Object.entries(FIELD_COLUMNS)) {
      table.string(column, 20).notNullable().defaultTo(fallback);
    }
    addTimestamps(knex, table);

    inCheck(table, 'profile_visibility', ['everyone', 'connections'], 'chk_privacy_profile_visibility');
    for (const column of Object.keys(FIELD_COLUMNS)) {
      inCheck(table, column, ['everyone', 'connections', 'nobody'], `chk_privacy_${column.replace('_visibility', '')}`);
    }
  });
  await maintainUpdatedAt(knex, 'privacy_settings');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('privacy_settings');
};
