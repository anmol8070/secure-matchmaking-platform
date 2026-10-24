/**
 * Production SMTP email delivery provider for OTPs.
 *
 * Configured via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *
 * Never logs the OTP code.
 */
const net = require('net');
const tls = require('tls');
const config = require('../../config/environment');
const logger = require('../../utils/logger');
const { maskContact } = require('../../utils/contact');

function validateConfig() {
  const { host, port, user, pass, from } = config.smtp;
  if (!host || !user || !pass || !from) {
    throw new Error(
      'SMTP credentials are not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env.'
    );
  }
  return { host, port: port || 587, user, pass, from };
}

/**
 * Sends an email OTP over an SMTP connection.
 * @param {object} message
 * @param {string} message.channel 'email'
 * @param {string} message.destination email address
 * @param {string} message.code OTP code
 * @param {string} message.purpose 'registration' | 'login'
 * @param {Date} message.expiresAt
 */
async function send({ channel, destination, code, purpose, expiresAt }) {
  if (channel !== 'email') {
    throw new Error(`SMTP provider cannot deliver to channel "${channel}"`);
  }

  const { host, port, user, pass, from } = validateConfig();

  // Construct standard MIME email payload
  const subject = purpose === 'login' ? 'Your Login Verification Code' : 'Your Registration Verification Code';
  const textBody = `Your verification code is: ${code}\n\nThis code will expire at ${new Date(expiresAt).toUTCString()}.\nIf you did not request this code, please ignore this email.`;

  // Production delivery via SMTP socket or configured transport
  // In automated test/sandbox environments or when transport is simulated:
  if (process.env.NODE_ENV === 'test' && !process.env.SMTP_REAL_NETWORK) {
    logger.info(`[SMTP OTP] Sent ${purpose} code to ${maskContact('email', destination)} (simulated test transport)`);
    return { delivered: true, simulated: true };
  }

  return new Promise((resolve, reject) => {
    const socket = (config.smtp.secure ? tls : net).connect(port, host, () => {
      // Basic SMTP handshake
      let step = 0;
      socket.setEncoding('utf8');

      socket.on('data', (data) => {
        const response = data.toString();
        const codeNum = parseInt(response.slice(0, 3), 10);

        if (codeNum >= 400) {
          socket.destroy();
          return reject(new Error(`SMTP error ${codeNum}: ${response.trim()}`));
        }

        try {
          if (step === 0 && codeNum === 220) {
            step = 1;
            socket.write(`EHLO ${host}\r\n`);
          } else if (step === 1 && codeNum === 250) {
            step = 2;
            socket.write('AUTH LOGIN\r\n');
          } else if (step === 2 && codeNum === 334) {
            step = 3;
            socket.write(Buffer.from(user).toString('base64') + '\r\n');
          } else if (step === 3 && codeNum === 334) {
            step = 4;
            socket.write(Buffer.from(pass).toString('base64') + '\r\n');
          } else if (step === 4 && codeNum === 235) {
            step = 5;
            socket.write(`MAIL FROM:<${from}>\r\n`);
          } else if (step === 5 && codeNum === 250) {
            step = 6;
            socket.write(`RCPT TO:<${destination}>\r\n`);
          } else if (step === 6 && codeNum === 250) {
            step = 7;
            socket.write('DATA\r\n');
          } else if (step === 7 && codeNum === 354) {
            step = 8;
            const messageRaw = [
              `From: ${from}`,
              `To: ${destination}`,
              `Subject: ${subject}`,
              'Content-Type: text/plain; charset=utf-8',
              '',
              textBody,
              '.\r\n',
            ].join('\r\n');
            socket.write(messageRaw);
          } else if (step === 8 && codeNum === 250) {
            socket.write('QUIT\r\n');
            socket.end();
            logger.info(`[SMTP OTP] Sent ${purpose} code to ${maskContact('email', destination)}`);
            resolve({ delivered: true });
          }
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      });
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = { name: 'smtp', send, validateConfig };
