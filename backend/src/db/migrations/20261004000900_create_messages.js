/**
 * messages — private one-to-one messages.
 * sent_at is the message timestamp; message_id breaks ties when ordering.
 */
const {
  applyTableOptions,
  userForeignKey,
  notSelfCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('messages', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('message_id').primary();
    userForeignKey(table, 'sender_id', { onDelete: 'RESTRICT' });
    userForeignKey(table, 'receiver_id', { onDelete: 'RESTRICT' });
    table.text('message').notNullable();
    table.datetime('sent_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.datetime('read_at', { useTz: true }).nullable();

    notSelfCheck(table, 'sender_id', 'receiver_id', 'chk_messages_not_self');
    table.check('CHAR_LENGTH(??) > 0', ['message'], 'chk_messages_not_empty');

    // Conversation A↔B is (sender=A, receiver=B) UNION (sender=B, receiver=A);
    // this index serves both halves ordered by time, and lookups by sender.
    table.index(['sender_id', 'receiver_id', 'sent_at'], 'idx_messages_conversation');
    // Inbox / unread messages for a receiver.
    table.index(['receiver_id', 'sent_at'], 'idx_messages_receiver');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('messages');
};
