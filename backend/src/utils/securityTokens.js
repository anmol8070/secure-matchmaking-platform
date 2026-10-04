/** Cryptographically secure random values and hashing helpers. */
const crypto = require('crypto');

/** Numeric one-time code of the given length (uniform, from the CSPRNG). */
function generateOtp(length) {
  let code = '';
  for (let i = 0; i < length; i += 1) code += crypto.randomInt(0, 10);
  return code;
}

/** High-entropy opaque token (256 bits), URL-safe. */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex — for high-entropy tokens only (never for passwords or OTPs). */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** HMAC-SHA256 hex — for low-entropy secrets like OTPs, keyed with a server secret. */
function hmacSha256(value, key) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

/** Constant-time comparison of two hex digests. */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

module.exports = { generateOtp, generateToken, sha256, hmacSha256, safeEqualHex };
