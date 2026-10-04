const API_VERSION = 'v1';

module.exports = {
  API_VERSION,
  API_PREFIX: `/api/${API_VERSION}`,
  // Maximum JSON / urlencoded body size. Profile photos will use multipart uploads (separate limit).
  REQUEST_BODY_LIMIT: '1mb',
};
