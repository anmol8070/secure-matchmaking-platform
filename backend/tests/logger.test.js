process.env.NODE_ENV = 'test';

const { redact } = require('../src/utils/logger');

describe('logger redaction', () => {
  it('masks sensitive keys at any depth', () => {
    const result = redact({
      userId: 7,
      password: 'hunter2',
      otp: '123456',
      headers: { authorization: 'Bearer abc', 'x-request-id': 'r1' },
      jwtToken: 'eyJ...',
      DB_PASSWORD: 'dbpass',
      message: 'private chat text',
      verification: { image: 'data:image/png;base64,...', faces_count: 1 },
      items: [{ secret: 's' }],
    });

    expect(result).toEqual({
      userId: 7,
      password: '[REDACTED]',
      otp: '[REDACTED]',
      headers: { authorization: '[REDACTED]', 'x-request-id': 'r1' },
      jwtToken: '[REDACTED]',
      DB_PASSWORD: '[REDACTED]',
      message: '[REDACTED]',
      verification: { image: '[REDACTED]', faces_count: 1 },
      items: [{ secret: '[REDACTED]' }],
    });
  });

  it('keeps errors readable', () => {
    const result = redact(new Error('boom'));
    expect(result).toMatchObject({ name: 'Error', message: 'boom' });
  });
});
