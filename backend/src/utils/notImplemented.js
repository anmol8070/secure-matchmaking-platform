/**
 * Placeholders for endpoints and services planned for later phases.
 * They fail with HTTP 501 through the central error handler — never with fake data.
 */
const ApiError = require('./ApiError');

/** Express handler for a planned endpoint. */
function notImplementedHandler() {
  throw ApiError.notImplemented();
}

/** Builds a controller object whose every handler is a 501 placeholder. */
function placeholderController(handlerNames) {
  return Object.fromEntries(handlerNames.map((name) => [name, notImplementedHandler]));
}

/** Builds a service object whose every function rejects with 501. */
function placeholderService(functionNames) {
  return Object.fromEntries(
    functionNames.map((name) => [
      name,
      async () => {
        throw ApiError.notImplemented();
      },
    ])
  );
}

module.exports = { notImplementedHandler, placeholderController, placeholderService };
