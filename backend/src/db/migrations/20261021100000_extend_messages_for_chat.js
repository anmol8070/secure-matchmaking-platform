/**
 * Phase 11: private real-time chat on the existing messages table.
 *
 * No conversations / participants tables: a conversation is always exactly
 * two users, and the pair already has one connection_requests row (Phase 10),
 * whose request_id is used as the conversation id. messages keeps
 * sender_id/receiver_id, so a conversation is
 * (sender=A, receiver=B) ∪ (sender=B, receiver=A).
 *
 *   - message_type: 'text' only for now; the CHECK is widened when other
 *     types are added in a later phase.
 *   - delivered_at: set when the message reached one of the receiver's
 *     devices (socket online, or history loaded). read_at already exists.
 *     Status is derived: read_at → read, delivered_at → delivered, else sent.
 *   - idx_messages_pair_id: history pages are cut by message_id (a stable,
 *     unique cursor), so each half of the conversation is read in id order.
 */
const MESSAGE_TYPES = ['text'];

exports.up = async function up(knex) {
  await knex.schema.alterTable('messages', (table) => {
    table.string('message_type', 20).notNullable().defaultTo('text');
    table.datetime('delivered_at', { useTz: true }).nullable();
    table.index(['sender_id', 'receiver_id', 'message_id'], 'idx_messages_pair_id');
  });
  // Table-level CHECK via raw SQL: knex does not bind CHECK values inside alterTable.
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IN (${MESSAGE_TYPES.map(() => '?').join(', ')}))`,
    ['messages', 'chk_messages_type', 'message_type', ...MESSAGE_TYPES]
  );
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', ['messages', 'chk_messages_type']);
  await knex.schema.alterTable('messages', (table) => {
    table.dropIndex(['sender_id', 'receiver_id', 'message_id'], 'idx_messages_pair_id');
    table.dropColumn('delivered_at');
    table.dropColumn('message_type');
  });
};
