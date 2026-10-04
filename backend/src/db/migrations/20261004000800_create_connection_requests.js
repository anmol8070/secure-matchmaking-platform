/**
 * connection_requests — pending → accepted | rejected workflow between users.
 */
const {
  applyTableOptions,
  addTimestamps,
  maintainUpdatedAt,
  userForeignKey,
  notSelfCheck,
  inCheck,
} = require('../schemaHelpers');

exports.up = async function up(knex) {
  await knex.schema.createTable('connection_requests', (table) => {
    applyTableOptions(knex, table);

    table.bigIncrements('request_id').primary();
    userForeignKey(table, 'sender_id', { onDelete: 'RESTRICT' });
    userForeignKey(table, 'receiver_id', { onDelete: 'RESTRICT' });
    table.string('status', 20).notNullable().defaultTo('pending');
    addTimestamps(knex, table);

    inCheck(table, 'status', ['pending', 'accepted', 'rejected'], 'chk_connection_requests_status');
    notSelfCheck(table, 'sender_id', 'receiver_id', 'chk_connection_requests_not_self');

    // One request per direction; a re-request updates the existing row.
    // Also serves "requests I sent" (sender_id prefix).
    table.unique(['sender_id', 'receiver_id'], { indexName: 'uq_connection_requests_pair' });
    // "Requests I received", filtered by status.
    table.index(['receiver_id', 'status'], 'idx_connection_requests_receiver_status');
  });

  await maintainUpdatedAt(knex, 'connection_requests');
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('connection_requests');
};
