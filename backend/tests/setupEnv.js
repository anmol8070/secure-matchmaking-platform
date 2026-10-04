/**
 * Test environment defaults (Jest setupFiles). Values already set in the
 * shell win. Rate limits are generous so suites are not throttled; the
 * rate-limit tests build their own strict limiters.
 */
const defaults = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789',
  OTP_SECRET: 'test-otp-secret-0123456789abcdef0123456789',
  OTP_PROVIDER: 'dev',
  OTP_LENGTH: '6',
  OTP_EXPIRY_MINUTES: '5',
  OTP_MAX_ATTEMPTS: '5',
  OTP_RESEND_COOLDOWN_SECONDS: '60',
  OTP_MAX_SENDS_PER_HOUR: '5',
  LOGIN_VERIFICATION_EXPIRY_MINUTES: '5',
  LOGIN_VERIFICATION_MAX_ATTEMPTS: '5',
  AUTH_RATE_LIMIT_MAX: '100000',
  AUTH_FAILED_ATTEMPTS_MAX: '100000',
  // Uploads go to a throw-away folder; a small size limit keeps oversize tests fast.
  UPLOADS_DIR: require('path').join(require('os').tmpdir(), 'matchmaking-test-uploads'),
  PROFILE_IMAGE_MAX_SIZE_MB: '1',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
