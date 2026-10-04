/**
 * otp_codes — one-time passwords for account verification and OTP login.
 *
 * Only an HMAC-SHA256 hash of the code is stored (keyed with OTP_SECRET), so a
 * database leak does not reveal codes and 6-digit codes cannot be brute-forced
 * offline. Issuing a new code invalidates the previous active one.
 */
const {
  applyTableOptions,
  addTimestamps,
  userForeignKey,
  inCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('otp_codes', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('otp_id').primary();
    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' });
    table.string('purpose', 20).notNullable();
    table.string('channel', 10).notNullable();
    table.string('otp_hash', 64).notNullable();
    table.datetime('expires_at', { useTz: true }).notNullable();
    table.integer('attempts').unsigned().notNullable().defaultTo(0);
    table.string('status', 20).notNullable().defaultTo('active');
    table.datetime('verified_at', { useTz: true }).nullable();
    addTimestamps(knex, table, { updatedAt: false });

    inCheck(table, 'purpose', ['registration', 'login'], 'chk_otp_codes_purpose');
    inCheck(table, 'channel', ['email', 'mobile'], 'chk_otp_codes_channel');
    inCheck(table, 'status', ['active', 'verified', 'invalidated'], 'chk_otp_codes_status');
    table.check('?? >= 0', ['attempts'], 'chk_otp_codes_attempts');
    table.check(
      "?? <> 'verified' OR ?? IS NOT NULL",
      ['status', 'verified_at'],
      'chk_otp_codes_verified_at'
    );

    // Active code lookup and resend-rate counting per user/purpose/channel.
    table.index(['user_id', 'purpose', 'channel', 'created_at'], 'idx_otp_codes_lookup');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('otp_codes');
};
