const express = require('express');
const request = require('supertest');

/** Builds a tiny app using the real error handler under the given NODE_ENV. */
function buildApp(nodeEnv) {
  let app;
  jest.isolateModules(() => {
    process.env.NODE_ENV = nodeEnv;
    const errorHandler = require('../src/middleware/errorHandler');
    const ApiError = require('../src/utils/ApiError');

    const dbError = (fields) => Object.assign(new Error('insert into "users" ... secret@example.com'), fields);

    app = express();
    app.get('/boom', () => {
      throw new Error('db password=secret leaked at D:\\project\\backend\\src\\x.js');
    });
    app.get('/async-boom', async () => {
      throw new Error('async failure');
    });
    app.get('/bad', () => {
      throw ApiError.badRequest('Invalid input');
    });
    app.get('/unauthorized', () => {
      throw ApiError.unauthorized();
    });
    app.get('/forbidden', () => {
      throw ApiError.forbidden();
    });
    app.get('/conflict', () => {
      throw ApiError.conflict();
    });
    app.get('/validation', () => {
      throw ApiError.validation([{ field: 'body.email', message: 'Invalid email' }]);
    });
    app.get('/jwt', () => {
      throw Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    });
    app.get('/pg-unique', () => {
      throw dbError({ code: '23505', constraint: 'uq_users_email' });
    });
    app.get('/pg-fk', () => {
      throw dbError({ code: '23503' });
    });
    app.get('/pg-restrict', () => {
      throw dbError({ code: '23001' });
    });
    app.get('/pg-check', () => {
      throw dbError({ code: '23514' });
    });
    app.get('/mysql-unique', () => {
      throw dbError({ code: 'ER_DUP_ENTRY', errno: 1062, sqlState: '23000' });
    });
    app.get('/mariadb-check', () => {
      throw dbError({ code: 'ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE', errno: 4025, sqlState: '23000' });
    });
    app.get('/db-down', () => {
      throw Object.assign(new AggregateError([Object.assign(new Error(), { code: 'ECONNREFUSED' })]), {
        code: 'ECONNREFUSED',
      });
    });
    app.use(errorHandler);
  });
  return app;
}

let consoleError;

// The logger is silent only when NODE_ENV=test; capture output instead.
beforeAll(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  process.env.NODE_ENV = 'test';
  jest.restoreAllMocks();
});

describe('errorHandler in production', () => {
  const app = buildApp('production');

  it('hides the message, stack and paths of unexpected errors', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Something went wrong' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|D:\\|stack/);
  });

  it('handles rejected async handlers centrally', async () => {
    const res = await request(app).get('/async-boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Something went wrong' });
  });

  it.each([
    ['/bad', 400, 'Invalid input'],
    ['/unauthorized', 401, 'Authentication required'],
    ['/forbidden', 403, 'You do not have permission to perform this action'],
    ['/conflict', 409, 'The request conflicts with existing data'],
    ['/jwt', 401, 'Invalid or expired token'],
  ])('maps %s to %i', async (path, status, message) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ success: false, message });
  });

  it('returns validation details in errors[] with 422', async () => {
    const res = await request(app).get('/validation');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false,
      message: 'Validation failed',
      errors: [{ field: 'body.email', message: 'Invalid email' }],
    });
  });

  it.each([
    ['/pg-unique', 409, 'A record with these details already exists'],
    ['/mysql-unique', 409, 'A record with these details already exists'],
    ['/pg-fk', 409, 'A referenced record does not exist'],
    ['/pg-restrict', 409, 'This record is still referenced by other data'],
    ['/pg-check', 422, 'The submitted data violates a data rule'],
    ['/mariadb-check', 422, 'The submitted data violates a data rule'],
    ['/db-down', 503, 'Service temporarily unavailable, please try again later'],
  ])('translates database error %s to a safe %i', async (path, status, message) => {
    consoleError.mockClear();
    const res = await request(app).get(path);

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ success: false, message });

    // The raw driver message (SQL + values) is neither returned nor logged.
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).not.toContain('secret@example.com');
    expect(JSON.stringify(res.body)).not.toContain('secret@example.com');
  });
});

describe('errorHandler in development', () => {
  const app = buildApp('development');

  it('includes the stack trace for unexpected server errors', async () => {
    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Something went wrong');
    expect(res.body.stack).toEqual(expect.any(String));
  });

  it('omits the stack trace for expected (operational) errors', async () => {
    const res = await request(app).get('/bad');

    expect(res.body.stack).toBeUndefined();
  });
});
