process.env.NODE_ENV = 'test';

const { buildKnexConfig, isConfigured } = require('../src/config/database');

const base = {
  client: 'postgres',
  url: '',
  host: 'db.local',
  port: undefined,
  database: 'app',
  username: 'user',
  password: 'secret',
  poolMin: 0,
  poolMax: 5,
};

describe('database config', () => {
  it('maps postgres to the pg driver with default port', () => {
    const cfg = buildKnexConfig(base);
    expect(cfg.client).toBe('pg');
    expect(cfg.connection).toMatchObject({ host: 'db.local', port: 5432, database: 'app' });
  });

  it('maps mysql to the mysql2 driver with default port', () => {
    const cfg = buildKnexConfig({ ...base, client: 'mysql' });
    expect(cfg.client).toBe('mysql2');
    expect(cfg.connection.port).toBe(3306);
  });

  it('prefers DATABASE_URL when provided', () => {
    const cfg = buildKnexConfig({ ...base, url: 'postgres://u:p@h:5432/d' });
    expect(cfg.connection).toBe('postgres://u:p@h:5432/d');
  });

  it('rejects unsupported clients', () => {
    expect(() => buildKnexConfig({ ...base, client: 'oracle' })).toThrow(/Unsupported DB_CLIENT/);
  });

  it('reports whether the database is configured', () => {
    expect(isConfigured(base)).toBe(true);
    expect(isConfigured({ ...base, host: '', database: '' })).toBe(false);
  });
});
