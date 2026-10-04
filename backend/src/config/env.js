/**
 * Centralised environment configuration.
 * All other modules read settings from here — never from process.env directly.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: toInt(process.env.PORT, 5000),
  apiPrefix: '/api/v1',

  // Comma-separated list of allowed origins, e.g. "http://localhost:5173,https://app.example.com"
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    // "postgres" or "mysql" — the rest of the app is database-agnostic
    client: (process.env.DB_CLIENT || 'postgres').toLowerCase(),
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '',
    port: process.env.DB_PORT ? toInt(process.env.DB_PORT, undefined) : undefined,
    database: process.env.DB_DATABASE || '',
    username: process.env.DB_USERNAME || '',
    password: process.env.DB_PASSWORD || '',
    poolMin: toInt(process.env.DB_POOL_MIN, 0),
    poolMax: toInt(process.env.DB_POOL_MAX, 10),
  },

  jwt: {
    // Used from Phase 3 (authentication) onward
    secret: process.env.JWT_SECRET || '',
  },
};

module.exports = config;
