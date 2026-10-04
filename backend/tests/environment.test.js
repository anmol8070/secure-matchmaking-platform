/** Loads src/config/environment.js with a controlled process.env. */
function loadConfig(env) {
  const saved = { ...process.env };
  let config;
  try {
    for (const key of Object.keys(process.env)) {
      if (/^(NODE_ENV|PORT|CORS_ORIGIN|DB_|DATABASE_URL|JWT_SECRET|OTP_)/.test(key)) delete process.env[key];
    }
    Object.assign(process.env, env);
    jest.isolateModules(() => {
      // Keep the real backend/.env out of these tests.
      jest.doMock('dotenv', () => ({ config: () => ({}) }));
      config = require('../src/config/environment');
    });
  } finally {
    process.env = saved;
    jest.dontMock('dotenv');
  }
  return config;
}

describe('environment configuration', () => {
  it('applies development defaults', () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      port: 5000,
      corsOrigins: [],
      db: { client: 'postgres', poolMin: 0, poolMax: 10 },
      otp: { expiryMinutes: 10 },
    });
  });

  it('reads values from environment variables', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGIN: 'https://app.example.com, https://admin.example.com',
      DB_CLIENT: 'MySQL',
      DB_HOST: 'db',
      DB_PORT: '3307',
      DB_DATABASE: 'app',
      DB_USERNAME: 'u',
      DB_PASSWORD: 'p',
      JWT_SECRET: 's',
      OTP_EXPIRY_MINUTES: '5',
    });

    expect(config).toMatchObject({
      isProduction: true,
      port: 8080,
      corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
      db: { client: 'mysql', host: 'db', port: 3307, database: 'app', username: 'u', password: 'p' },
      jwt: { secret: 's' },
      otp: { expiryMinutes: 5 },
    });
  });

  it('accepts a complete production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
      DATABASE_URL: 'postgres://u:p@db:5432/app',
    });
    expect(config.validateEnvironment()).toEqual([]);
  });

  it('refuses to start production without CORS origins or a database', () => {
    const config = loadConfig({ NODE_ENV: 'production' });
    expect(config.validateEnvironment()).toEqual([
      'CORS_ORIGIN must be set in production',
      'Database settings (DATABASE_URL or DB_HOST/DB_DATABASE) must be set in production',
    ]);
  });

  it('refuses unrestricted CORS in production but allows it in development', () => {
    const prod = loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: '*', DB_HOST: 'h', DB_DATABASE: 'd' });
    expect(prod.validateEnvironment()).toEqual(['CORS_ORIGIN must not be "*" in production']);

    const dev = loadConfig({ NODE_ENV: 'development', CORS_ORIGIN: '*' });
    expect(dev.validateEnvironment()).toEqual([]);
  });
});
