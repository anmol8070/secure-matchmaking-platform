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

/** Comma-separated list → trimmed, non-empty values. */
const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

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

  // Private chat (Phase 11)
  messages: {
    // Messages per history page when no limit is given, and the largest allowed limit
    defaultLimit: toInt(process.env.MESSAGE_DEFAULT_LIMIT, 50),
    maxLimit: toInt(process.env.MESSAGE_MAX_LIMIT, 100),
    // Longest accepted message, in characters (after trimming)
    maxLength: toInt(process.env.MESSAGE_MAX_LENGTH, 2000),
    // Messages one user may send per window (REST and Socket.IO share the budget)
    rateLimit: toInt(process.env.MESSAGE_RATE_LIMIT, 60),
    rateWindowSeconds: toInt(process.env.MESSAGE_RATE_WINDOW_SECONDS, 60),
  },

  // Images sent in private chat. Stored OUTSIDE the public /media folder and
  // served only to the two participants (GET /messages/:id/image).
  chatImages: {
    maxSizeMb: Number(process.env.CHAT_IMAGE_MAX_SIZE_MB) || 5,
    // Stored images are resized to fit within this many pixels per side
    maxDimension: toInt(process.env.CHAT_IMAGE_MAX_DIMENSION, 1600),
    privateDir: path.resolve(__dirname, '../..', process.env.PRIVATE_UPLOADS_DIR || 'uploads-private'),
  },

  // Private video calls (Phase 12). Media flows peer-to-peer (WebRTC); the API
  // only relays signalling and stores call metadata — never audio/video.
  calls: {
    // Seconds an unanswered call rings before it becomes "missed"
    ringTimeoutSeconds: toInt(process.env.CALL_RING_TIMEOUT_SECONDS, 30),
    // Seconds an accepted call may take to report a connected peer connection
    connectTimeoutSeconds: toInt(process.env.CALL_CONNECT_TIMEOUT_SECONDS, 45),
    // Seconds a participant may be away (refresh, network drop) before the call ends
    rejoinGraceSeconds: toInt(process.env.CALL_REJOIN_GRACE_SECONDS, 20),
    // Signalling messages one user may send per 10 seconds (SDP + ICE candidates)
    signalRateLimit: toInt(process.env.CALL_SIGNAL_RATE_LIMIT, 300),
    // Calls one user may start per minute
    initiateRateLimit: toInt(process.env.CALL_INITIATE_RATE_LIMIT, 10),
  },

  // Admin panel (Phase 14)
  admin: {
    defaultPageSize: toInt(process.env.ADMIN_DEFAULT_PAGE_SIZE, 20),
    maxPageSize: toInt(process.env.ADMIN_MAX_PAGE_SIZE, 100),
    // Longest date range accepted by dashboard/activity filters
    maxRangeDays: toInt(process.env.ADMIN_MAX_RANGE_DAYS, 366),
    // Admin API requests per admin per minute, and status changes per minute
    requestRateLimit: toInt(process.env.ADMIN_RATE_LIMIT_PER_MINUTE, 300),
    actionRateLimit: toInt(process.env.ADMIN_ACTION_RATE_LIMIT_PER_MINUTE, 30),
  },

  // User reports (Phase 13)
  reports: {
    // Reports one user may submit per hour (duplicates of an open report are not counted twice)
    rateLimitPerHour: toInt(process.env.REPORT_RATE_LIMIT_PER_HOUR, 10),
  },

  // ICE servers handed to authenticated browsers (GET /calls/ice-servers).
  webrtc: {
    stunUrls: splitList(process.env.WEBRTC_STUN_URL || 'stun:stun.l.google.com:19302'),
    turnUrls: splitList(process.env.WEBRTC_TURN_URL || ''),
    // Static TURN credentials (simple setups). Prefer WEBRTC_TURN_SECRET.
    turnUsername: process.env.WEBRTC_TURN_USERNAME || '',
    turnCredential: process.env.WEBRTC_TURN_CREDENTIAL || '',
    // Shared secret of a TURN server using the "TURN REST API" scheme
    // (coturn use-auth-secret): the API mints short-lived per-user credentials.
    turnSecret: process.env.WEBRTC_TURN_SECRET || '',
    turnCredentialTtlSeconds: toInt(process.env.WEBRTC_TURN_TTL_SECONDS, 3600),
  },

  // Optional. When set, Socket.IO events/presence and the message rate limit are
  // shared through Redis, so several API instances can run behind a load balancer.
  redis: {
    url: process.env.REDIS_URL || '',
  },

  // SMTP Email Delivery (for production OTP)
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: toInt(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    secure: process.env.SMTP_SECURE === 'true',
  },

  // Twilio SMS Delivery (for production OTP)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
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
    // TODO: Restore before production use. Temporarily skipped so Render can
    // start with OTP_PROVIDER=dev. This does not expose development OTP codes:
    // the dev outbox route stays unmounted in production, and getProvider()
    // still refuses the dev provider when NODE_ENV=production.
    // if (cfg.otp.provider === 'dev') {
    //   problems.push('OTP_PROVIDER=dev is for development only — configure a real OTP provider');
    // }
  }
  // TODO: Restore before production use. Temporarily skipped so Render can
  // start without MEDIA_PUBLIC_BASE_URL. Signed photo access is unchanged.
  // if (cfg.isProduction && !(cfg.media.publicBaseUrlConfigured && cfg.media.publicBaseUrl.startsWith('https://'))) {
  //   problems.push('MEDIA_PUBLIC_BASE_URL must be set to the public https:// origin that serves media in production');
  // }
  if (cfg.otp.length < 4 || cfg.otp.length > 10) problems.push('OTP_LENGTH must be between 4 and 10');
  return problems;
}

/**
 * Extended operational readiness check for production deployment.
 * Validates external infrastructure (TURN relay, real email/SMS provider credentials).
 */
function validateProductionReadiness(cfg = config) {
  const issues = [...validateEnvironment(cfg)];
  if (cfg.otp.provider === 'smtp' || cfg.otp.provider === 'production') {
    if (!cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass || !cfg.smtp.from) {
      issues.push('SMTP settings (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM) must be set for production email delivery');
    }
  }
  if (cfg.otp.provider === 'twilio' || cfg.otp.provider === 'production') {
    if (!cfg.twilio.accountSid || !cfg.twilio.authToken || !cfg.twilio.fromNumber) {
      issues.push('Twilio settings (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) must be set for production SMS delivery');
    }
  }
  // TODO: Restore before production use. Temporarily skipped so Render can
  // start without WEBRTC_TURN_URL. Calls still do not advertise a TURN relay
  // unless WEBRTC_TURN_URL is set.
  // if (cfg.webrtc.turnUrls.length === 0) {
  //   issues.push('WEBRTC_TURN_URL must be configured with a TURN relay server in production for reliable WebRTC calls across NATs');
  // }
  return issues;
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
config.validateProductionReadiness = validateProductionReadiness;

module.exports = config;
