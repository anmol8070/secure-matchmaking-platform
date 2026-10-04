process.env.NODE_ENV = 'test';

const request = require('supertest');
const { createApp } = require('../src/app');

const ALLOWED_ORIGIN = 'http://localhost:5173';
const app = createApp({ corsOrigins: [ALLOWED_ORIGIN] });

const NOT_IMPLEMENTED = {
  success: false,
  message: 'This module will be implemented in a later development phase',
};

// Every planned endpoint registered in Phase 3, grouped by module.
const PLACEHOLDER_ENDPOINTS = [
  ['post', '/api/v1/auth/register'],
  ['post', '/api/v1/auth/otp/send'],
  ['post', '/api/v1/auth/otp/verify'],
  ['post', '/api/v1/auth/login'],
  ['post', '/api/v1/auth/login/verification'],
  ['post', '/api/v1/auth/logout'],
  ['get', '/api/v1/auth/me'],
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
  ['get', '/api/v1/connections/requests'],
  ['post', '/api/v1/connections/requests'],
  ['patch', '/api/v1/connections/requests/7'],
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
  ['post', '/api/v1/admin/login'],
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

describe('placeholder modules', () => {
  it.each(PLACEHOLDER_ENDPOINTS)('%s %s returns a controlled 501', async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(501);
    expect(res.body).toEqual(NOT_IMPLEMENTED);
  });
});

describe('request validation', () => {
  it.each([
    ['get', '/api/v1/profile/abc', 'params.userId'],
    ['get', '/api/v1/matches/0', 'params.userId'],
    ['delete', '/api/v1/blocks/-5', 'params.userId'],
    ['patch', '/api/v1/connections/requests/x', 'params.requestId'],
    ['patch', '/api/v1/admin/reports/1.5', 'params.reportId'],
  ])('%s %s returns 422 with field errors', async (method, path, field) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false,
      message: 'Validation failed',
      errors: [{ field, message: expect.any(String) }],
    });
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
    const res = await request(app).post('/api/v1/auth/login').set('Origin', 'http://evil.example.com');

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
      request(app).get('/api/v1/profile/abc'),
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
