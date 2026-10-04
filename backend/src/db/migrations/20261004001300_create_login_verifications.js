/**
 * login_verifications — live human/face *presence* checks performed at login.
 *
 * Privacy by design:
 *  - No image column: the captured frame is processed and discarded, never stored.
 *  - detection_result holds only the detector outcome (e.g. faces detected,
 *    confidence), never biometric templates or embeddings.
 *  - No relationship to profiles.profile_photo_url — this is presence detection,
 *    not facial recognition.
 */
const {
  applyTableOptions,
  addTimestamps,
  userForeignKey,
  inCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('login_verifications', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('verification_id').primary();
    userForeignKey(table, 'user_id', { onDelete: 'CASCADE' });
    table.string('verification_status', 20).notNullable().defaultTo('pending');
    // e.g. { "face_detected": true, "faces_count": 1, "confidence": 0.97 }
    table.jsonb('detection_result').nullable();
    table.integer('attempt_count').unsigned().notNullable().defaultTo(0);
    table.datetime('attempted_at', { useTz: true }).nullable();
    table.datetime('verified_at', { useTz: true }).nullable();
    addTimestamps(knex, table, { updatedAt: false });

    inCheck(
      table,
      'verification_status',
      ['pending', 'passed', 'failed', 'expired'],
      'chk_login_verifications_status'
    );
    table.check('?? >= 0', ['attempt_count'], 'chk_login_verifications_attempts');
    table.check(
      "?? <> 'passed' OR ?? IS NOT NULL",
      ['verification_status', 'verified_at'],
      'chk_login_verifications_verified_at'
    );

    // Latest verification for a user / rate-limiting recent attempts.
    table.index(['user_id', 'created_at'], 'idx_login_verifications_user_created');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('login_verifications');
};
