process.env.NODE_ENV = 'test';

const path = require('path');
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

  it('maps mysql to the mysql2 driver with default port, UTC and utf8mb4', () => {
    const cfg = buildKnexConfig({ ...base, client: 'mysql' });
    expect(cfg.client).toBe('mysql2');
    expect(cfg.connection).toMatchObject({ port: 3306, timezone: 'Z', charset: 'utf8mb4' });
    expect(typeof cfg.pool.afterCreate).toBe('function');
  });

  it('uses DATABASE_URL when provided', () => {
    const pg = buildKnexConfig({ ...base, url: 'postgres://u:p@h:5432/d' });
    expect(pg.connection).toEqual({ connectionString: 'postgres://u:p@h:5432/d' });

    const mysql = buildKnexConfig({ ...base, client: 'mysql', url: 'mysql://u:p@h:3306/d' });
    expect(mysql.connection.uri).toBe('mysql://u:p@h:3306/d');
  });

  it('can override the database name, including inside DATABASE_URL', () => {
    expect(buildKnexConfig(base, { database: 'other' }).connection.database).toBe('other');

    const fromUrl = buildKnexConfig({ ...base, url: 'postgres://u:p@h:5432/d' }, { database: 'other' });
    expect(fromUrl.connection.connectionString).toBe('postgres://u:p@h:5432/other');
  });

  it('points migrations and seeds at src/db', () => {
    const cfg = buildKnexConfig(base);
    expect(cfg.migrations.directory).toBe(path.resolve(__dirname, '../src/db/migrations'));
    expect(cfg.seeds.directory).toBe(path.resolve(__dirname, '../src/db/seeds'));
  });

  it('rejects unsupported clients', () => {
    expect(() => buildKnexConfig({ ...base, client: 'oracle' })).toThrow(/Unsupported DB_CLIENT/);
  });

  it('reports whether the database is configured', () => {
    expect(isConfigured(base)).toBe(true);
    expect(isConfigured({ ...base, host: '', database: '' })).toBe(false);
  });
});
