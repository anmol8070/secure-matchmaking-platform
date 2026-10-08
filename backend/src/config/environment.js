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

/** Express "trust proxy": a hop count ("1"), a subnet/list ("loopback"), or off. */
function parseTrustProxy(value) {
  if (!value) return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: toInt(process.env.PORT, 5000),
  // Set when running behind a reverse proxy/load balancer so rate limits see the client IP
  // (e.g. TRUST_PROXY=1 for one proxy hop). Leave empty when the API is exposed directly.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  // Comma-separated list of allowed origins, e.g. "http://localhost:5173,https://app.example.com".
  // "*" (any origin) is accepted outside production only.
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
    secret: process.env.JWT_SECRET || '',
    // Any value accepted by jsonwebtoken, e.g. "15m", "12h", "1d"
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  otp: {
    length: toInt(process.env.OTP_LENGTH, 6),
    expiryMinutes: toInt(process.env.OTP_EXPIRY_MINUTES, 5),
    maxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: toInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60),
    maxSendsPerHour: toInt(process.env.OTP_MAX_SENDS_PER_HOUR, 5),
    // HMAC key for stored OTP hashes; falls back to JWT_SECRET outside production
    secret: process.env.OTP_SECRET || '',
    // Delivery provider: "dev" (development outbox, never in production)
    provider: (process.env.OTP_PROVIDER || 'dev').toLowerCase(),
  },

  loginVerification: {
    expiryMinutes: toInt(process.env.LOGIN_VERIFICATION_EXPIRY_MINUTES, 5),
    maxAttempts: toInt(process.env.LOGIN_VERIFICATION_MAX_ATTEMPTS, 5),
  },

  rateLimit: {
    windowMinutes: toInt(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES, 15),
    // All /auth requests per IP per window
    authMaxPerIp: toInt(process.env.AUTH_RATE_LIMIT_MAX, 100),
    // Failed password/OTP checks per IP + account per window (no account lockout)
    failedAttemptsMax: toInt(process.env.AUTH_FAILED_ATTEMPTS_MAX, 10),
  },

  // Prefix for 10-digit mobile numbers entered without a country code
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '+91',

  // Uploaded media (profile pictures)
  media: {
    // "local" = files on this server's disk, served under /media
    storageProvider: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),
    uploadsDir: path.resolve(__dirname, '../..', process.env.UPLOADS_DIR || 'uploads'),
    // Origin used to build absolute image URLs, e.g. https://api.example.com
    publicBaseUrl: (process.env.MEDIA_PUBLIC_BASE_URL || `http://localhost:${toInt(process.env.PORT, 5000)}`).replace(/\/+$/, ''),
    publicBaseUrlConfigured: Boolean(process.env.MEDIA_PUBLIC_BASE_URL),
  },

  quiz: {
    // JSON file with the compatibility questionnaire (see src/config/quiz-questions.json)
    questionsFile: path.resolve(__dirname, '../..', process.env.QUIZ_QUESTIONS_FILE || 'src/config/quiz-questions.json'),
  },

  profileImage: {
    maxSizeMb: Number(process.env.PROFILE_IMAGE_MAX_SIZE_MB) || 5,
    // Stored images are resized to fit within this many pixels per side
    maxDimension: toInt(process.env.PROFILE_IMAGE_MAX_DIMENSION, 1024),
  },

  recommendation: {
    // Number of candidates returned per page when no limit is specified
    defaultLimit: toInt(process.env.RECOMMENDATION_DEFAULT_LIMIT, 20),
    // Hard ceiling on the limit query parameter — prevents excessively large requests
    maxLimit: toInt(process.env.RECOMMENDATION_MAX_LIMIT, 100),
  },
};

const PLACEHOLDER_SECRET = /^(|replace_with.*|changeme|secret)$/i;

/**
 * Returns a list of configuration problems that must be fixed before the
 * server may start in production. Development/test only get warnings.
 */
function validateEnvironment(cfg = config) {
  const problems = [];
  if (cfg.isProduction) {
    if (cfg.corsOrigins.length === 0) problems.push('CORS_ORIGIN must be set in production');
    if (cfg.corsOrigins.includes('*')) problems.push('CORS_ORIGIN must not be "*" in production');
    if (!cfg.db.url && !(cfg.db.host && cfg.db.database)) {
      problems.push('Database settings (DATABASE_URL or DB_HOST/DB_DATABASE) must be set in production');
    }
    if (PLACEHOLDER_SECRET.test(cfg.jwt.secret) || cfg.jwt.secret.length < 32) {
      problems.push('JWT_SECRET must be a random value of at least 32 characters in production');
    }
    if (PLACEHOLDER_SECRET.test(cfg.otp.secret) || cfg.otp.secret.length < 32) {
      problems.push('OTP_SECRET must be a random value of at least 32 characters in production');
    }
    if (cfg.otp.provider === 'dev') {
      problems.push('OTP_PROVIDER=dev is for development only — configure a real OTP provider');
    }
  }
  if (cfg.isProduction && !(cfg.media.publicBaseUrlConfigured && cfg.media.publicBaseUrl.startsWith('https://'))) {
    problems.push('MEDIA_PUBLIC_BASE_URL must be set to the public https:// origin that serves media in production');
  }
  if (cfg.otp.length < 4 || cfg.otp.length > 10) problems.push('OTP_LENGTH must be between 4 and 10');
  return problems;
}

/**
 * Secrets used for signing. Outside production a missing secret falls back to
 * a per-process random value (tokens then stop working after a restart).
 */
let devSecret;
function signingSecret(value) {
  if (value && !PLACEHOLDER_SECRET.test(value)) return value;
  if (nodeEnv === 'production') throw new Error('Signing secret is not configured');
  devSecret ||= require('crypto').randomBytes(48).toString('hex');
  return devSecret;
}

config.jwtSecret = () => signingSecret(config.jwt.secret);
config.otpSecret = () => signingSecret(config.otp.secret || config.jwt.secret);

config.validateEnvironment = validateEnvironment;

module.exports = config;
