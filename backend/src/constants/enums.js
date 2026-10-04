/**
 * Allowed values for enum-like columns. These MUST match the CHECK constraints
 * in src/db/migrations — tests/integration/models.test.js verifies that they do.
 * When a value is added, add a migration that updates the CHECK constraint too.
 */
module.exports = Object.freeze({
  ROLES: Object.freeze({ USER: 'user', ADMIN: 'admin' }),
  USER_ROLES: Object.freeze(['user', 'admin']),
  USER_STATUSES: Object.freeze([
    'pending_verification',
    'active',
    'suspended',
    'banned',
    'deactivated',
    'deleted',
  ]),
  HOBBY_STATUSES: Object.freeze(['active', 'inactive']),
  CONNECTION_STATUSES: Object.freeze(['pending', 'accepted', 'rejected']),
  REPORT_STATUSES: Object.freeze(['pending', 'under_review', 'resolved', 'dismissed']),
  ACTIVITY_ACTIONS: Object.freeze([
    'profile_view',
    'interest',
    'connection_request',
    'connection_accepted',
    'rejection',
    'feedback',
  ]),
  VERIFICATION_STATUSES: Object.freeze(['pending', 'passed', 'failed', 'expired']),
});
