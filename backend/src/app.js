/**
 * Express application definition (no network listener — see server.js).
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./config/env');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

app.disable('x-powered-by');
app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (Postman, curl, server-to-server) with no Origin header
      if (!origin || config.corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(requestLogger);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(config.apiPrefix, apiRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
