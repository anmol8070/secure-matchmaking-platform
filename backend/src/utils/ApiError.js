/**
 * Operational error with an HTTP status code.
 * Throw this from services/controllers/middleware; the central error handler
 * formats the response. `errors` holds field-level details (e.g. validation).
 */
const HTTP = require('../constants/httpStatus');
const MESSAGES = require('../constants/messages');

class ApiError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request', errors) {
    return new ApiError(HTTP.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = MESSAGES.UNAUTHORIZED) {
    return new ApiError(HTTP.UNAUTHORIZED, message);
  }

  static forbidden(message = MESSAGES.FORBIDDEN) {
    return new ApiError(HTTP.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(HTTP.NOT_FOUND, message);
  }

  static conflict(message = MESSAGES.CONFLICT, errors) {
    return new ApiError(HTTP.CONFLICT, message, errors);
  }

  static validation(errors, message = MESSAGES.VALIDATION_FAILED) {
    return new ApiError(HTTP.UNPROCESSABLE_ENTITY, message, errors);
  }

  static notImplemented(message = MESSAGES.NOT_IMPLEMENTED) {
    return new ApiError(HTTP.NOT_IMPLEMENTED, message);
  }

  static serviceUnavailable(message = MESSAGES.SERVICE_UNAVAILABLE) {
    return new ApiError(HTTP.SERVICE_UNAVAILABLE, message);
  }
}

module.exports = ApiError;
