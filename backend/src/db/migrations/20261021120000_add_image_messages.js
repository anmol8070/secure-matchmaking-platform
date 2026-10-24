/**
 * Phase 11: image messages in private chat.
 *
 *   - message_type CHECK widened to ('text', 'image').
 *   - attachment_* columns describe the stored image. The file itself is in
 *     PRIVATE storage (never under the public /media folder); attachment_key
 *     is the server-generated storage key.
 *   - chk_messages_not_empty is replaced by chk_messages_content:
 *       text  → message must not be empty
 *       image → an attachment is required; message is an optional caption ('')
 */
const OLD_TYPES = ['text'];
const NEW_TYPES = ['text', 'image'];

async function replaceTypeCheck(knex, types) {
  await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', ['messages', 'chk_messages_type']);
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (?? IN (${types.map(() => '?').join(', ')}))`, [
    'messages',
    'chk_messages_type',
    'message_type',
    ...types,
  ]);
}

exports.up = async function up(knex) {
  await knex.schema.alterTable('messages', (table) => {
    table.string('attachment_key', 255).nullable();
    table.string('attachment_content_type', 50).nullable();
    table.integer('attachment_width').unsigned().nullable();
    table.integer('attachment_height').unsigned().nullable();
    table.integer('attachment_size').unsigned().nullable();
  });
  await replaceTypeCheck(knex, NEW_TYPES);
  await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', ['messages', 'chk_messages_not_empty']);
  await knex.raw(
    "ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ((?? = 'text' AND CHAR_LENGTH(??) > 0) OR (?? = 'image' AND ?? IS NOT NULL))",
    ['messages', 'chk_messages_content', 'message_type', 'message', 'message_type', 'attachment_key']
  );
};

exports.down = async function down(knex) {
  // The old schema cannot represent images: they are removed on rollback.
  await knex('messages').where({ message_type: 'image' }).del();
  await knex.raw('ALTER TABLE ?? DROP CONSTRAINT ??', ['messages', 'chk_messages_content']);
  await knex.raw('ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (CHAR_LENGTH(??) > 0)', ['messages', 'chk_messages_not_empty', 'message']);
  await replaceTypeCheck(knex, OLD_TYPES);
  await knex.schema.alterTable('messages', (table) => {
    table.dropColumn('attachment_size');
    table.dropColumn('attachment_height');
    table.dropColumn('attachment_width');
    table.dropColumn('attachment_content_type');
    table.dropColumn('attachment_key');
  });
};
