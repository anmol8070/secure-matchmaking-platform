/**
 * Production Twilio SMS delivery provider for OTPs.
 *
 * Configured via environment variables:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * Never logs the OTP code.
 */
const https = require('https');
const config = require('../../config/environment');
const logger = require('../../utils/logger');
const { maskContact } = require('../../utils/contact');

function validateConfig() {
  const { accountSid, authToken, fromNumber } = config.twilio;
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      'Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in .env.'
    );
  }
  return { accountSid, authToken, fromNumber };
}

/**
 * Sends an SMS OTP via the Twilio REST API.
 * @param {object} message
 * @param {string} message.channel 'mobile'
 * @param {string} message.destination phone number (e.g. +91...)
 * @param {string} message.code OTP code
 * @param {string} message.purpose 'registration' | 'login'
 */
async function send({ channel, destination, code, purpose }) {
  if (channel !== 'mobile') {
    throw new Error(`Twilio SMS provider cannot deliver to channel "${channel}"`);
  }

  const { accountSid, authToken, fromNumber } = validateConfig();

  const bodyText = `Your verification code is: ${code}. Do not share this code with anyone.`;

  // In test environments or when simulated:
  if (process.env.NODE_ENV === 'test' && !process.env.TWILIO_REAL_NETWORK) {
    logger.info(`[Twilio OTP] Sent ${purpose} SMS to ${maskContact('mobile', destination)} (simulated test transport)`);
    return { delivered: true, simulated: true };
  }

  const postData = new URLSearchParams({
    To: destination,
    From: fromNumber,
    Body: bodyText,
  }).toString();

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info(`[Twilio OTP] Sent ${purpose} SMS to ${maskContact('mobile', destination)}`);
          resolve({ delivered: true });
        } else {
          logger.error('Twilio SMS delivery rejected by API', {
            statusCode: res.statusCode,
            destination: maskContact('mobile', destination),
          });
          reject(new Error(`Twilio API returned status ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Twilio request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

module.exports = { name: 'twilio', send, validateConfig };
