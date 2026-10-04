const morgan = require('morgan');
const config = require('../config/env');

// Concise logs in development, Apache combined format in production, silent in tests.
const format = config.isProduction ? 'combined' : 'dev';

module.exports = morgan(format, { skip: () => config.isTest });
