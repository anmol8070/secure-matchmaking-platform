/**
 * HTTP access log. Logs method, path (without query string — it can carry
 * tokens or personal data), status, size and duration. No headers or bodies.
 */
const morgan = require('morgan');
const config = require('../config/environment');

morgan.token('path', (req) => req.originalUrl.split('?')[0]);

const format = config.isProduction
  ? ':remote-addr [:date[iso]] ":method :path" :status :res[content-length] - :response-time ms'
  : ':method :path :status :response-time ms - :res[content-length]';

module.exports = morgan(format, { skip: () => config.isTest });
