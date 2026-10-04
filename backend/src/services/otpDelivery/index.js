/**
 * OTP delivery integration point.
 *
 * A provider exposes:
 *   send({ channel: 'email'|'mobile', destination, code, purpose, expiresAt }) → Promise
 *
 * To add a real provider (e.g. SMTP for email, an SMS gateway for mobile):
 *   1. create services/otpDelivery/<name>Provider.js implementing send()
 *   2. register it in PROVIDERS below
 *   3. set OTP_PROVIDER=<name> and the provider's credentials in .env
 * Providers must never log the code.
 */
const config = require('../../config/environment');
const ApiError = require('../../utils/ApiError');

const PROVIDERS = {
  dev: () => require('./devOtpProvider'),
};

function getProvider(name = config.otp.provider) {
  const factory = PROVIDERS[name];
  if (!factory) throw new Error(`Unknown OTP_PROVIDER "${name}"`);
  if (name === 'dev' && config.isProduction) {
    throw new Error('The dev OTP provider cannot be used in production');
  }
  return factory();
}

async function deliverOtp(message) {
  try {
    await getProvider().send(message);
  } catch (err) {
    // Provider details stay in the server log; the client gets a generic 503.
    require('../../utils/logger').error('OTP delivery failed', { provider: config.otp.provider, error: err.message });
    throw ApiError.serviceUnavailable('Could not send the OTP right now. Please try again shortly.');
  }
}

module.exports = { deliverOtp, getProvider };
