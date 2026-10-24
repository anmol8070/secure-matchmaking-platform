/**
 * OTP delivery selection. No network calls. Codes must not appear in errors.
 */
const config = require('../src/config/environment');
const { getProvider } = require('../src/services/otpDelivery');
const smtp = require('../src/services/otpDelivery/smtpProvider');
const twilio = require('../src/services/otpDelivery/twilioProvider');

describe('OTP providers', () => {
  const original = {
    isProduction: config.isProduction,
    smtp: { ...config.smtp },
    twilio: { ...config.twilio },
  };

  afterEach(() => {
    config.isProduction = original.isProduction;
    Object.assign(config.smtp, original.smtp);
    Object.assign(config.twilio, original.twilio);
  });

  it('refuses the development outbox when NODE_ENV is production', () => {
    config.isProduction = true;
    expect(() => getProvider('dev')).toThrow(/dev OTP provider cannot be used in production/);
  });

  it('allows the development outbox outside production', () => {
    config.isProduction = false;
    expect(getProvider('dev').name).toBe('dev');
  });

  it('refuses SMTP and Twilio delivery when credentials are missing, without embedding a code', () => {
    config.smtp.host = '';
    config.smtp.user = '';
    config.smtp.pass = '';
    config.smtp.from = '';
    config.twilio.accountSid = '';
    config.twilio.authToken = '';
    config.twilio.fromNumber = '';

    expect(() => smtp.validateConfig()).toThrow(/SMTP_HOST/);
    expect(() => twilio.validateConfig()).toThrow(/TWILIO_ACCOUNT_SID/);
    try {
      smtp.validateConfig();
    } catch (err) {
      expect(err.message).not.toMatch(/\d{6}/);
    }
  });
});
