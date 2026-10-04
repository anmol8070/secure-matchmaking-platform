/**
 * DEVELOPMENT-ONLY OTP provider.
 *
 * Instead of sending an email/SMS, it keeps the latest code per destination in
 * memory (the "dev outbox"), readable through GET /api/v1/dev/otp, which is
 * mounted only when NODE_ENV !== 'production' and OTP_PROVIDER=dev. Production
 * refuses to start with this provider (see config/environment.js).
 *
 * The code itself is never written to the logs.
 */
const logger = require('../../utils/logger');
const { maskContact } = require('../../utils/contact');

const outbox = new Map();

async function send({ channel, destination, code, purpose, expiresAt }) {
  outbox.set(destination, { channel, purpose, code, expiresAt, sentAt: new Date() });
  logger.info(`[dev OTP] ${purpose} code for ${maskContact(channel, destination)} is in the dev outbox`);
}

/** Latest message for a destination (development tooling and tests only). */
function peek(destination) {
  return outbox.get(destination) || null;
}

function clear() {
  outbox.clear();
}

module.exports = { name: 'dev', send, peek, clear };
