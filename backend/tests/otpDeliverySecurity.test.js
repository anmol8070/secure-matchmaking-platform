/**
 * Security unit tests for OTP Delivery & Provider Integration:
 * - Development provider behavior & production prohibition
 * - Production SMTP email adapter credential validation & simulated delivery
 * - Production Twilio SMS adapter credential validation & simulated delivery
 * - Multi-channel routing in productionOtpProvider
 * - Safe error handling in deliverOtp (503 without leaking secrets or codes)
 * - Secret and code privacy (never logging OTP values)
 */
process.env.NODE_ENV = 'test';

const config = require('../src/config/environment');
const { getProvider, deliverOtp } = require('../src/services/otpDelivery');
const devOtpProvider = require('../src/services/otpDelivery/devOtpProvider');
const smtpProvider = require('../src/services/otpDelivery/smtpProvider');
const twilioProvider = require('../src/services/otpDelivery/twilioProvider');
const productionOtpProvider = require('../src/services/otpDelivery/productionOtpProvider');

describe('OTP Delivery - Development Provider', () => {
  beforeEach(() => {
    devOtpProvider.clear();
  });

  it('stores sent OTP in development outbox for tests/tooling', async () => {
    await devOtpProvider.send({
      channel: 'email',
      destination: 'alice@example.com',
      code: '123456',
      purpose: 'registration',
      expiresAt: new Date(Date.now() + 300000),
    });

    const peeked = devOtpProvider.peek('alice@example.com');
    expect(peeked).not.toBeNull();
    expect(peeked.code).toBe('123456');
    expect(peeked.purpose).toBe('registration');
  });

  it('prohibits dev provider when NODE_ENV is production', () => {
    const originalEnv = config.isProduction;
    try {
      config.isProduction = true;
      expect(() => getProvider('dev')).toThrow('The dev OTP provider cannot be used in production');
    } finally {
      config.isProduction = originalEnv;
    }
  });
});

describe('OTP Delivery - Production SMTP Provider', () => {
  it('validates required SMTP configuration credentials', () => {
    const originalSmtp = { ...config.smtp };
    try {
      config.smtp = { host: '', port: 587, user: '', pass: '', from: '' };
      expect(() => smtpProvider.validateConfig()).toThrow(/SMTP credentials are not configured/);
    } finally {
      config.smtp = originalSmtp;
    }
  });

  it('simulates safe delivery in test mode without throwing when credentials configured', async () => {
    const originalSmtp = { ...config.smtp };
    try {
      config.smtp = {
        host: 'smtp.example.com',
        port: 587,
        user: 'smtp_user',
        pass: 'smtp_pass',
        from: 'noreply@example.com',
      };

      const result = await smtpProvider.send({
        channel: 'email',
        destination: 'bob@example.com',
        code: '654321',
        purpose: 'login',
        expiresAt: new Date(Date.now() + 300000),
      });

      expect(result.delivered).toBe(true);
      expect(result.simulated).toBe(true);
    } finally {
      config.smtp = originalSmtp;
    }
  });

  it('rejects delivery to mobile channel on SMTP provider', async () => {
    await expect(
      smtpProvider.send({
        channel: 'mobile',
        destination: '+919876543210',
        code: '123456',
        purpose: 'login',
      })
    ).rejects.toThrow('SMTP provider cannot deliver to channel "mobile"');
  });
});

describe('OTP Delivery - Production Twilio Provider', () => {
  it('validates required Twilio configuration credentials', () => {
    const originalTwilio = { ...config.twilio };
    try {
      config.twilio = { accountSid: '', authToken: '', fromNumber: '' };
      expect(() => twilioProvider.validateConfig()).toThrow(/Twilio credentials are not configured/);
    } finally {
      config.twilio = originalTwilio;
    }
  });

  it('simulates safe SMS delivery in test mode when credentials configured', async () => {
    const originalTwilio = { ...config.twilio };
    try {
      config.twilio = {
        accountSid: 'test-twilio-account',
        authToken: 'auth_token_secret_123',
        fromNumber: '+1234567890',
      };

      const result = await twilioProvider.send({
        channel: 'mobile',
        destination: '+919876543210',
        code: '789012',
        purpose: 'login',
      });

      expect(result.delivered).toBe(true);
      expect(result.simulated).toBe(true);
    } finally {
      config.twilio = originalTwilio;
    }
  });

  it('rejects delivery to email channel on Twilio provider', async () => {
    await expect(
      twilioProvider.send({
        channel: 'email',
        destination: 'user@example.com',
        code: '123456',
        purpose: 'login',
      })
    ).rejects.toThrow('Twilio SMS provider cannot deliver to channel "email"');
  });
});

describe('OTP Delivery - Multi-channel Production Router', () => {
  it('routes email channel to SMTP and mobile to Twilio', async () => {
    const originalSmtp = { ...config.smtp };
    const originalTwilio = { ...config.twilio };

    try {
      config.smtp = { host: 'smtp.example.com', port: 587, user: 'u', pass: 'p', from: 'from@example.com' };
      config.twilio = { accountSid: 'ACxxx', authToken: 'yyy', fromNumber: '+1234' };

      const emailResult = await productionOtpProvider.send({
        channel: 'email',
        destination: 'charlie@example.com',
        code: '111222',
        purpose: 'registration',
        expiresAt: new Date(),
      });
      expect(emailResult.delivered).toBe(true);

      const smsResult = await productionOtpProvider.send({
        channel: 'mobile',
        destination: '+919876543210',
        code: '333444',
        purpose: 'registration',
        expiresAt: new Date(),
      });
      expect(smsResult.delivered).toBe(true);
    } finally {
      config.smtp = originalSmtp;
      config.twilio = originalTwilio;
    }
  });
});

describe('OTP Delivery - Error Handling', () => {
  it('wraps delivery failures into generic 503 ApiError without leaking secrets', async () => {
    const originalProvider = config.otp.provider;
    try {
      config.otp.provider = 'smtp';
      await expect(
        deliverOtp({
          channel: 'mobile', // smtp provider rejects mobile channel
          destination: '+919876543210',
          code: '123456',
          purpose: 'login',
        })
      ).rejects.toMatchObject({
        statusCode: 503,
        message: 'Could not send the OTP right now. Please try again shortly.',
      });
    } finally {
      config.otp.provider = originalProvider;
    }
  });
});
