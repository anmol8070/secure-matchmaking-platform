/** Connection requests.
 * Phase 3: every handler is a 501 placeholder — no business logic yet. */
const { placeholderController } = require('../utils/notImplemented');

module.exports = placeholderController([
  'listConnections',
  'listRequests',
  'sendRequest',
  'respondToRequest',
]);
