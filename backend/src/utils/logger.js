/**
 * Minimal console logger with redaction.
 * Can be swapped for winston/pino later without changing call sites.
 *
 * Never pass raw request bodies, tokens, OTPs, passwords, message text or
 * camera frames to the logger. As a safety net, `meta` objects are redacted
 * by key name before they are written.
 */
const config = require('../config/environment');

const SENSITIVE_KEY = /pass(word)?|secret|token|otp|authorization|cookie|jwt|api[-_]?key|message|image|photo|frame|selfie/i;
const REDACTED = '[REDACTED]';

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 5) return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1)])
  );
}

function write(level, message, meta) {
  if (config.isTest) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta !== undefined) {
    stream(line, redact(meta));
  } else {
    stream(line);
  }
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  redact,
};
