/**
 * users — account-level identity and state. Profile data lives in `profiles`.
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  inCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('user_id').primary();
    // Either email or mobile (or both) identifies the account for OTP login.
    // Emails are stored lower-cased; the application normalises before insert.
    table.string('email', 255).nullable().unique('uq_users_email');
    table.string('mobile', 20).nullable().unique('uq_users_mobile');
    // Hash only (bcrypt/argon2, added in Phase 3). Nullable for OTP-only accounts.
    table.string('password_hash', 255).nullable();
    table.string('role', 20).notNullable().defaultTo('user');
    table.string('status', 30).notNullable().defaultTo('pending_verification');
    table.datetime('email_verified_at', { useTz: true }).nullable();
    table.datetime('mobile_verified_at', { useTz: true }).nullable();
    table.datetime('last_login_at', { useTz: true }).nullable();
    addTimestamps(knex, table);

    inCheck(table, 'role', ['user', 'admin'], 'chk_users_role');
    inCheck(
      table,
      'status',
      ['pending_verification', 'active', 'suspended', 'banned', 'deactivated', 'deleted'],
      'chk_users_status'
    );
    table.check('?? IS NOT NULL OR ?? IS NOT NULL', ['email', 'mobile'], 'chk_users_email_or_mobile');
    table.check('?? = LOWER(??)', ['email', 'email'], 'chk_users_email_lowercase');
  });

  await maintainUpdatedAt(knex, 'users');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('users');
};
