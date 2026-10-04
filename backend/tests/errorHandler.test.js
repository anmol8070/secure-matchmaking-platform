const express = require('express');
const request = require('supertest');

/** Builds a tiny app using the real error handler under the given NODE_ENV. */
function buildApp(nodeEnv) {
  let app;
  jest.isolateModules(() => {
    process.env.NODE_ENV = nodeEnv;
    const errorHandler = require('../src/middleware/errorHandler');
    const ApiError = require('../src/utils/ApiError');

    app = express();
    app.get('/boom', () => {
      throw new Error('db password=secret leaked');
    });
    app.get('/bad', () => {
      throw ApiError.badRequest('Invalid input');
    });
    app.use(errorHandler);
  });
  return app;
}

// The logger is silent only when NODE_ENV=test; keep test output clean.
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  process.env.NODE_ENV = 'test';
  jest.restoreAllMocks();
});

describe('errorHandler in production', () => {
  const app = buildApp('production');

  it('hides the message and stack of unexpected errors', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal server error' });
  });

  it('still returns operational error messages', async () => {
    const res = await request(app).get('/bad');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Invalid input' });
  });
});

describe('errorHandler in development', () => {
  const app = buildApp('development');

  it('includes the stack trace for server errors', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.stack).toEqual(expect.any(String));
  });

  it('omits the stack trace for client errors', async () => {
    const res = await request(app).get('/bad');

    expect(res.body.stack).toBeUndefined();
  });
});
