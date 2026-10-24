/**
 * video_calls — metadata of private video calls (Phase 12).
 *
 * Only metadata is stored: who called whom, the state, timestamps and why
 * it ended. Audio/video never touches the server (WebRTC is peer-to-peer,
 * optionally relayed by TURN) and signalling payloads (SDP, ICE) are never
 * stored.
 *
 * Lifecycle (enforced by callService with conditional updates):
 *   ringing ─accept─▶ accepted ─peer connected─▶ connected ─end─▶ ended
 *      │                 │                          └─failure──▶ failed
 *      ├─reject─▶ rejected└─end/failure/timeout──▶ ended | failed
 *      ├─caller ends─▶ cancelled
 *      └─timeout─▶ missed
 *   busy: the receiver was already in a call (recorded, never rang).
 */
const { applyTableOptions, addTimestamps, maintainUpdatedAt, userForeignKey, notSelfCheck, inCheck } = require('../schemaHelpers');

const STATUSES = ['ringing', 'accepted', 'connected', 'rejected', 'missed', 'cancelled', 'busy', 'ended', 'failed'];

exports.up = async function up(knex) {
  await knex.schema.createTable('video_calls', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('call_id').primary();
    userForeignKey(table, 'caller_id', { onDelete: 'RESTRICT' });
    userForeignKey(table, 'receiver_id', { onDelete: 'RESTRICT' });
    table.string('status', 20).notNullable().defaultTo('ringing');
    table.datetime('answered_at', { useTz: true }).nullable();
    table.datetime('connected_at', { useTz: true }).nullable();
    table.datetime('ended_at', { useTz: true }).nullable();
    table.integer('duration_seconds').unsigned().nullable();
    table.string('end_reason', 30).nullable();
    userForeignKey(table, 'ended_by', { onDelete: 'SET NULL', nullable: true });
    addTimestamps(knex, table); // created_at = when the call was placed

    inCheck(table, 'status', STATUSES, 'chk_video_calls_status');
    notSelfCheck(table, 'caller_id', 'receiver_id', 'chk_video_calls_not_self');

    // Call history of a user, newest first (both roles).
    table.index(['caller_id', 'call_id'], 'idx_video_calls_caller');
    table.index(['receiver_id', 'call_id'], 'idx_video_calls_receiver');
    // Active-call lookups and the stale-call sweep.
    table.index(['status', 'created_at'], 'idx_video_calls_status');
  });

  await maintainUpdatedAt(knex, 'video_calls');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('video_calls');
};
