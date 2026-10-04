/**
 * Normalisation of login identifiers so the same person always maps to the
 * same stored value (emails lower-case; mobiles in E.164, e.g. +919876543210).
 */
const config = require('../config/environment');

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

/**
 * Accepts "+<country><number>" or a 10-digit national number (prefixed with
 * DEFAULT_COUNTRY_CODE). Spaces, dashes, dots and brackets are ignored.
 * Returns null when the value is not a plausible mobile number.
 */
function normalizeMobile(mobile, defaultCountryCode = config.defaultCountryCode) {
  const compact = String(mobile).replace(/[\s\-().]/g, '');
  let e164;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) e164 = compact;
  else if (/^0?\d{10}$/.test(compact)) e164 = `${defaultCountryCode}${compact.replace(/^0/, '')}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Classifies a login identifier as an email or a mobile number. */
function parseIdentifier(identifier) {
  const value = String(identifier || '').trim();
  if (value.includes('@')) return { channel: 'email', value: normalizeEmail(value) };
  const mobile = normalizeMobile(value);
  return mobile ? { channel: 'mobile', value: mobile } : null;
}

/** Partially hidden contact for responses, e.g. "us**@example.com", "+91******3210". */
function maskContact(channel, value) {
  if (channel === 'email') {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }
  return `${value.slice(0, 3)}${'*'.repeat(Math.max(value.length - 7, 1))}${value.slice(-4)}`;
}

module.exports = { normalizeEmail, normalizeMobile, parseIdentifier, maskContact };
