/**
 * Adds 'cancelled' and 'removed' to connection_requests status check constraint.
 */
exports.up = async function up(knex) {
  // Drop the old check constraint and add the new one
  await knex.raw('ALTER TABLE connection_requests DROP CONSTRAINT chk_connection_requests_status');
  await knex.raw("ALTER TABLE connection_requests ADD CONSTRAINT chk_connection_requests_status CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'removed'))");
};

exports.down = async function down(knex) {
  // We can't safely downgrade if there are rows with the new statuses,
  // but for the sake of standard migration practices:
  await knex.raw("UPDATE connection_requests SET status = 'rejected' WHERE status IN ('cancelled', 'removed')");
  await knex.raw('ALTER TABLE connection_requests DROP CONSTRAINT chk_connection_requests_status');
  await knex.raw("ALTER TABLE connection_requests ADD CONSTRAINT chk_connection_requests_status CHECK (status IN ('pending', 'accepted', 'rejected'))");
};
