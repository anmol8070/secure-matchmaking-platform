process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const request = require('supertest');
const app = require('../src/app');

describe('GET /api/v1/health', () => {
  it('returns 200 with the running message', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'API is running' });
  });

  it('sets CORS headers for an allowed origin', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not set CORS headers for a disallowed origin', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Error handling', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Route not found/);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json"');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'Malformed JSON in request body' });
  });
});
