/**
 * Standard response envelopes. Controllers use these instead of res.json directly.
 *
 *   success: { success: true,  message, data }
 *   error:   { success: false, message, errors? }   (built by middleware/errorHandler)
 */
const HTTP = require('../constants/httpStatus');
const MESSAGES = require('../constants/messages');

function sendSuccess(res, { statusCode = HTTP.OK, message = MESSAGES.SUCCESS, data = {} } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendCreated(res, { message = 'Created successfully', data = {} } = {}) {
  return sendSuccess(res, { statusCode: HTTP.CREATED, message, data });
}

function buildErrorBody(message, errors) {
  const body = { success: false, message };
  if (errors && errors.length > 0) body.errors = errors;
  return body;
}

module.exports = { sendSuccess, sendCreated, buildErrorBody };
