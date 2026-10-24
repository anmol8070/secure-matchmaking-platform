/**
 * Multi-channel production OTP provider.
 * Routes email destinations to smtpProvider and mobile destinations to twilioProvider.
 */
const smtpProvider = require('./smtpProvider');
const twilioProvider = require('./twilioProvider');

async function send(message) {
  if (message.channel === 'email') {
    return smtpProvider.send(message);
  }
  if (message.channel === 'mobile') {
    return twilioProvider.send(message);
  }
  throw new Error(`Unsupported OTP channel "${message.channel}"`);
}

module.exports = { name: 'production', send };
