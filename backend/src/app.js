/**
 * Express application: middleware, /api/v1 routes, 404 and error handling.
 * No business logic and no network listener here (see server.js).
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config/environment');
const { buildCorsOptions } = require('./config/cors');
const { API_PREFIX, REQUEST_BODY_LIMIT } = require('./constants/api');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

function createApp({ corsOrigins } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors(buildCorsOptions(corsOrigins)));
  app.use(requestLogger);
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

  app.use(API_PREFIX, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
