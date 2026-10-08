process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');

const ALLOWED_ORIGIN = 'http://localhost:5173';
const app = createApp({ corsOrigins: [ALLOWED_ORIGIN] });

// Every protected endpoint (module placeholders + admin). Without a token → 401.
const PROTECTED_ENDPOINTS = [
  ['get', '/api/v1/profile'],
  ['post', '/api/v1/profile'],
  ['put', '/api/v1/profile'],
  ['put', '/api/v1/profile/photo'],
  ['delete', '/api/v1/profile/photo'],
  ['get', '/api/v1/profile/42'],
  ['get', '/api/v1/preferences'],
  ['put', '/api/v1/preferences'],
  ['get', '/api/v1/hobbies'],
  ['get', '/api/v1/hobbies/me'],
  ['put', '/api/v1/hobbies/me'],
  ['get', '/api/v1/matches'],
  ['get', '/api/v1/matches/42'],
  ['get', '/api/v1/recommendations'],
  ['get', '/api/v1/connections'],
  ['post', '/api/v1/connections'],
  ['get', '/api/v1/connections/requests/received'],
  ['get', '/api/v1/connections/requests/sent'],
  ['get', '/api/v1/connections/status/42'],
  ['get', '/api/v1/connections/7'],
  ['put', '/api/v1/connections/7'],
  ['delete', '/api/v1/connections/7'],
  ['get', '/api/v1/messages/conversations'],
  ['get', '/api/v1/messages/42'],
  ['post', '/api/v1/messages/42'],
  ['patch', '/api/v1/messages/42/read'],
  ['post', '/api/v1/reports'],
  ['get', '/api/v1/reports'],
  ['get', '/api/v1/blocks'],
  ['post', '/api/v1/blocks'],
  ['delete', '/api/v1/blocks/42'],
  ['post', '/api/v1/feedback'],
  ['get', '/api/v1/feedback'],
  ['get', '/api/v1/admin/dashboard'],
  ['get', '/api/v1/admin/users'],
  ['get', '/api/v1/admin/users/42'],
  ['patch', '/api/v1/admin/users/42/status'],
  ['get', '/api/v1/admin/reports'],
  ['patch', '/api/v1/admin/reports/9'],
  ['get', '/api/v1/admin/activity'],
  ['get', '/api/v1/admin/monitoring'],
];

describe('GET /api/v1/health', () => {
  it('returns 200 with status, version, timestamp and environment', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      success: true,
      message: 'API is running',
      version: 'v1',
      timestamp: expect.any(String),
      environment: 'test',
    });
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it('is only available under the versioned prefix', async () => {
    expect((await request(app).get('/health')).status).toBe(404);
    expect((await request(app).get('/api/health')).status).toBe(404);
  });

  it('sends basic security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('404 handler', () => {
  it.each(['/api/v1/does-not-exist', '/api/v2/health', '/', '/api/v1/auth/unknown'])(
    'returns the standard 404 body for %s',
    async (path) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'API endpoint not found' });
    }
  );

  it('returns 404 for an unsupported method on an existing path', async () => {
    const res = await request(app).delete('/api/v1/health');
    expect(res.status).toBe(404);
  });
});

describe('protected modules', () => {
  // With a valid token these return 501 placeholders — see tests/integration/auth.test.js.
  it.each(PROTECTED_ENDPOINTS)('%s %s requires authentication', async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Authentication required' });
  });

  it.each([
    ['Basic abc', 'Invalid or expired token'],
    ['Bearer not-a-jwt', 'Invalid or expired token'],
    ['Bearer aaa.bbb.ccc', 'Invalid or expired token'],
  ])('rejects Authorization "%s" with 401', async (header, message) => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', header);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message });
  });
});

describe('request validation', () => {
  // Validation runs before any database access, so these need no database.
  it.each([
    ['/api/v1/auth/register', { password: 'Secure123' }, 'body.email', 'Email or mobile number is required'],
    ['/api/v1/auth/register', { email: 'nope', password: 'Secure123' }, 'body.email', 'Enter a valid email address'],
    ['/api/v1/auth/register', { mobile: '12', password: 'Secure123' }, 'body.mobile', 'Enter a valid mobile number'],
    ['/api/v1/auth/register', { email: 'a@b.co', password: 'short1' }, 'body.password', 'Password must be at least 8 characters'],
    ['/api/v1/auth/register', { email: 'a@b.co', password: 'onlyletters' }, 'body.password', 'Password must contain a number'],
    ['/api/v1/auth/send-otp', { email: 'a@b.co', mobile: '9876543210' }, 'body.email', 'Provide either an email or a mobile number'],
    ['/api/v1/auth/verify-otp', { email: 'a@b.co', otp: '12ab56' }, 'body.otp', 'OTP must be 6 digits'],
    ['/api/v1/auth/login', { identifier: 'a@b.co' }, 'body.password', 'Password is required'],
  ])('POST %s %j returns 422', async (path, body, field, message) => {
    const res = await request(app).post(path).send(body);

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toContainEqual({ field, message });
  });

  it('rejects camera images in the live verification request', async () => {
    const res = await request(app).post('/api/v1/auth/login-verification/complete').send({
      verification_token: 'x'.repeat(43),
      face_detected: true,
      face_count: 1,
      image: 'data:image/png;base64,AAAA',
    });

    expect(res.status).toBe(422);
    expect(res.body.errors[0].message).toMatch(/Unrecognized key/);
  });
});

describe('request parsing', () => {
  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"bad json"');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Malformed JSON in request body' });
  });

  it('returns 413 for bodies over the size limit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(1024 * 1024 + 1) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, message: 'Request body is too large' });
  });
});

describe('CORS', () => {
  it('allows the configured origin', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('answers preflight requests for the configured origin', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });

  it('rejects other origins with 403 before reaching routes', async () => {
    const res = await request(app).post('/api/v1/auth/register').set('Origin', 'http://evil.example.com');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ success: false, message: 'Origin not allowed by CORS policy' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests without an Origin header (Postman, server-to-server)', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });

  it('reflects any origin when CORS_ORIGIN is "*" (development only)', async () => {
    const openApp = createApp({ corsOrigins: ['*'] });
    const res = await request(openApp).get('/api/v1/health').set('Origin', 'http://anything.test');

    expect(res.headers['access-control-allow-origin']).toBe('http://anything.test');
  });
});

describe('response format', () => {
  it('uses { success, message } on every error response', async () => {
    const responses = await Promise.all([
      request(app).get('/api/v1/nope'),
      request(app).get('/api/v1/profile'),
      request(app).post('/api/v1/auth/register').send({}),
      request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{'),
      request(app).get('/api/v1/health').set('Origin', 'http://evil.example.com'),
    ]);

    for (const res of responses) {
      expect(res.body.success).toBe(false);
      expect(typeof res.body.message).toBe('string');
      expect(Object.keys(res.body).every((key) => ['success', 'message', 'errors'].includes(key))).toBe(
        true
      );
    }
  });
});
