/**
 * Unit tests for authentication building blocks (no database needed).
 */
const express = require('express');
const request = require('supertest');
const { hashPassword, verifyPassword } = require('../src/utils/password');
const { generateOtp, generateToken, sha256, hmacSha256, safeEqualHex } = require('../src/utils/securityTokens');
const { normalizeMobile, parseIdentifier, maskContact } = require('../src/utils/contact');
const { evaluateDetection } = require('../src/services/verificationService');
const { createLimiter, accountKey } = require('../src/middleware/rateLimiter');
const errorHandler = require('../src/middleware/errorHandler');

describe('password hashing', () => {
  it('stores a salted scrypt hash, never the password', async () => {
    const hash = await hashPassword('Secure123');

    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('Secure123');
    expect(await hashPassword('Secure123')).not.toBe(hash); // random salt
  });

  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('Secure123');

    expect(await verifyPassword('Secure123', hash)).toBe(true);
    expect(await verifyPassword('secure123', hash)).toBe(false);
    expect(await verifyPassword('Secure123', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('Secure123', null)).toBe(false);
  });
});

describe('secure random values', () => {
  it('generates numeric OTPs of the configured length', () => {
    for (const length of [4, 6, 8]) expect(generateOtp(length)).toMatch(new RegExp(`^\\d{${length}}$`));
  });

  it('produces varied OTPs (CSPRNG)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateOtp(6)));
    expect(codes.size).toBeGreaterThan(190);
  });

  it('generates 256-bit URL-safe tokens', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(token);
  });

  it('hashes OTPs with a keyed HMAC and compares in constant time', () => {
    const a = hmacSha256('123456', 'key-1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacSha256('123456', 'key-2')).not.toBe(a);
    expect(safeEqualHex(a, hmacSha256('123456', 'key-1'))).toBe(true);
    expect(safeEqualHex(a, sha256('123456'))).toBe(false);
    expect(safeEqualHex(a, 'short')).toBe(false);
  });
});

describe('contact normalisation', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['+14155552671', '+14155552671'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('normalises mobile %s → %s', (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });

  it.each(['12', 'abcdefghij', '+0123456789', '98765432101234567'])('rejects mobile %s', (input) => {
    expect(normalizeMobile(input)).toBeNull();
  });

  it('classifies identifiers', () => {
    expect(parseIdentifier(' User@Example.com ')).toEqual({ channel: 'email', value: 'user@example.com' });
    expect(parseIdentifier('9876543210')).toEqual({ channel: 'mobile', value: '+919876543210' });
    expect(parseIdentifier('nonsense')).toBeNull();
  });

  it('masks contacts for responses', () => {
    expect(maskContact('email', 'user@example.com')).toBe('us**@example.com');
    expect(maskContact('mobile', '+919876543210')).toBe('+91******3210');
  });
});

describe('face presence rule', () => {
  it.each([
    [{ face_detected: true, face_count: 1 }, 'passed'],
    [{ face_detected: false, face_count: 0 }, 'no_face'],
    [{ face_detected: true, face_count: 0 }, 'no_face'],
    [{ face_detected: false, face_count: 1 }, 'no_face'],
    [{ face_detected: true, face_count: 2 }, 'multiple_faces'],
    [{ face_detected: true, face_count: 5 }, 'multiple_faces'],
  ])('%j → %s', (detection, outcome) => {
    expect(evaluateDetection(detection)).toBe(outcome);
  });
});

describe('rate limiting', () => {
  function appWith(limiter, status = 401) {
    const app = express();
    app.use(express.json());
    app.post('/attempt', limiter, (req, res) => res.status(status).json({ success: status < 400 }));
    app.use(errorHandler);
    return app;
  }

  it('blocks an account after repeated failures from the same IP with 429', async () => {
    const app = appWith(createLimiter({ limit: 3, keyGenerator: accountKey, skipSuccessfulRequests: true, message: 'Too many failed attempts' }));

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).post('/attempt').send({ identifier: 'victim@example.com' })).status).toBe(401);
    }
    const blocked = await request(app).post('/attempt').send({ identifier: 'victim@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, message: 'Too many failed attempts' });
    expect(blocked.headers.ratelimit).toBeDefined();

    // A different account from the same IP is unaffected (no global lockout).
    expect((await request(app).post('/attempt').send({ identifier: 'other@example.com' })).status).toBe(401);
  });

  it('does not count successful requests', async () => {
    const app = appWith(createLimiter({ limit: 2, keyGenerator: accountKey, skipSuccessfulRequests: true, message: 'x' }), 200);
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).post('/attempt').send({ identifier: 'ok@example.com' })).status).toBe(200);
    }
  });
});

describe('registration when the database is unavailable', () => {
  it('fails safely with 503 and no internal details', async () => {
    let app;
    jest.isolateModules(() => {
      const config = require('../src/config/environment');
      // Unreachable server → connection refused immediately.
      Object.assign(config.db, { client: 'postgres', url: '', host: '127.0.0.1', port: 1, database: 'x' });
      app = require('../src/app').createApp({ corsOrigins: [] });
    });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dbdown@example.com', password: 'Secure123' });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, message: 'Service temporarily unavailable, please try again later' });
  }, 20000);
});
