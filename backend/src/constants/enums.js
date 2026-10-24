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
  CONNECTION_STATUSES: Object.freeze(['pending', 'accepted', 'rejected', 'cancelled', 'disconnected']),
  REPORT_STATUSES: Object.freeze(['pending', 'under_review', 'resolved', 'dismissed']),
  ACTIVITY_ACTIONS: Object.freeze([
    'profile_view',
    'interest',
    'connection_request',
    'connection_accepted',
    'rejection',
    'feedback',
    // Phase 10
    'connection_cancelled',
    'connection_removed',
  ]),
  // Phase 12 (video_calls.status)
  CALL_STATUSES: Object.freeze(['ringing', 'accepted', 'connected', 'rejected', 'missed', 'cancelled', 'busy', 'ended', 'failed']),
  // Phase 13
  REPORT_REASONS: Object.freeze(['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'threatening', 'other']),
  REPORT_ACTIONS: Object.freeze(['none', 'warning', 'content_removed', 'suspended', 'banned']),
  PRIVACY_VISIBILITY: Object.freeze(['everyone', 'connections', 'nobody']),
  PROFILE_VISIBILITY: Object.freeze(['everyone', 'connections']),
  // Phase 14
  ADMIN_AUDIT_ACTIONS: Object.freeze(['user_suspended', 'user_reactivated', 'report_status_changed', 'ml_training_run']),
  VERIFICATION_STATUSES: Object.freeze(['pending', 'passed', 'failed', 'expired']),
});
