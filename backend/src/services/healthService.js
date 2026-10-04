const config = require('../config/environment');
const { API_VERSION } = require('../constants/api');
const MESSAGES = require('../constants/messages');

/** API liveness information. Contains nothing sensitive (no hostnames, versions or DB details). */
function getStatus() {
  return {
    success: true,
    message: MESSAGES.API_RUNNING,
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  };
}

module.exports = { getStatus };
