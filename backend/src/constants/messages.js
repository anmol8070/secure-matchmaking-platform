/** Client-facing messages. Keep them generic — never include internal details. */
module.exports = Object.freeze({
  SUCCESS: 'Request successful',
  API_RUNNING: 'API is running',
  NOT_FOUND: 'API endpoint not found',
  NOT_IMPLEMENTED: 'This module will be implemented in a later development phase',
  VALIDATION_FAILED: 'Validation failed',
  MALFORMED_JSON: 'Malformed JSON in request body',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'You do not have permission to perform this action',
  CONFLICT: 'The request conflicts with existing data',
  DUPLICATE_RECORD: 'A record with these details already exists',
  INVALID_REFERENCE: 'A referenced record does not exist',
  RECORD_IN_USE: 'This record is still referenced by other data',
  CONSTRAINT_VIOLATION: 'The submitted data violates a data rule',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable, please try again later',
  INTERNAL_ERROR: 'Something went wrong',
});
