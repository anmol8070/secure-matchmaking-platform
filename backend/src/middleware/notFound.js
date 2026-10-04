const ApiError = require('../utils/ApiError');
const MESSAGES = require('../constants/messages');

/** Catches every request that no route matched. Registered after all routes. */
function notFound(req, res, next) {
  next(ApiError.notFound(MESSAGES.NOT_FOUND));
}

module.exports = notFound;
