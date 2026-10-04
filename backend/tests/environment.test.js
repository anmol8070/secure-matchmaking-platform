/** Loads src/config/environment.js with a controlled process.env. */
function loadConfig(env) {
  const saved = { ...process.env };
  let config;
  try {
    for (const key of Object.keys(process.env)) {
      if (/^(NODE_ENV|PORT|CORS_ORIGIN|DB_|DATABASE_URL|JWT_|OTP_|LOGIN_|AUTH_|TRUST_PROXY|DEFAULT_COUNTRY|MEDIA_|STORAGE_|UPLOADS_|PROFILE_IMAGE_)/.test(key)) delete process.env[key];
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
      otp: { length: 6, expiryMinutes: 5, maxAttempts: 5, provider: 'dev' },
      jwt: { expiresIn: '1d' },
      trustProxy: false,
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
      OTP_EXPIRY_MINUTES: '3',
      OTP_LENGTH: '8',
      JWT_EXPIRES_IN: '2h',
      TRUST_PROXY: '1',
    });

    expect(config).toMatchObject({
      isProduction: true,
      port: 8080,
      corsOrigins: ['https://app.example.com', 'https://admin.example.com'],
      db: { client: 'mysql', host: 'db', port: 3307, database: 'app', username: 'u', password: 'p' },
      jwt: { secret: 's', expiresIn: '2h' },
      otp: { expiryMinutes: 3, length: 8 },
      trustProxy: 1,
    });
  });

  it('accepts a complete production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
      DATABASE_URL: 'postgres://u:p@db:5432/app',
      JWT_SECRET: 'j'.repeat(40), OTP_SECRET: 'o'.repeat(40), OTP_PROVIDER: 'smtp',
      MEDIA_PUBLIC_BASE_URL: 'https://api.example.com',
    });
    expect(config.validateEnvironment()).toEqual([]);
  });

  it('refuses to start production without CORS, database, secrets or an OTP provider', () => {
    const config = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'replace_with_a_long_random_secret' });
    expect(config.validateEnvironment()).toEqual([
      'CORS_ORIGIN must be set in production',
      'Database settings (DATABASE_URL or DB_HOST/DB_DATABASE) must be set in production',
      'JWT_SECRET must be a random value of at least 32 characters in production',
      'OTP_SECRET must be a random value of at least 32 characters in production',
      'OTP_PROVIDER=dev is for development only — configure a real OTP provider',
      'MEDIA_PUBLIC_BASE_URL must be set to the public https:// origin that serves media in production',
    ]);
  });

  it('reads media and profile image settings', () => {
    const config = loadConfig({ PORT: '7000', PROFILE_IMAGE_MAX_SIZE_MB: '2.5', UPLOADS_DIR: 'data/uploads' });
    expect(config.media).toMatchObject({ storageProvider: 'local', publicBaseUrl: 'http://localhost:7000', publicBaseUrlConfigured: false });
    expect(config.media.uploadsDir).toBe(require('path').resolve(__dirname, '..', 'data/uploads'));
    expect(config.profileImage).toEqual({ maxSizeMb: 2.5, maxDimension: 1024 });
  });

  it('uses an ephemeral signing secret outside production when none is configured', () => {
    const dev = loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'replace_with_a_long_random_secret' });
    expect(dev.jwtSecret()).toHaveLength(96);
    expect(dev.jwtSecret()).toBe(dev.jwtSecret());

    const prod = loadConfig({ NODE_ENV: 'production' });
    expect(() => prod.jwtSecret()).toThrow(/not configured/);
  });

  it('refuses unrestricted CORS in production but allows it in development', () => {
    const prod = loadConfig({
      NODE_ENV: 'production',
      CORS_ORIGIN: '*',
      DB_HOST: 'h',
      DB_DATABASE: 'd',
      JWT_SECRET: 'j'.repeat(40), OTP_SECRET: 'o'.repeat(40), OTP_PROVIDER: 'smtp',
      MEDIA_PUBLIC_BASE_URL: 'https://api.example.com',
    });
    expect(prod.validateEnvironment()).toEqual(['CORS_ORIGIN must not be "*" in production']);

    const dev = loadConfig({ NODE_ENV: 'development', CORS_ORIGIN: '*' });
    expect(dev.validateEnvironment()).toEqual([]);
  });
});
