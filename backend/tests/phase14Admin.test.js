/**
 * Phase 14 — admin helpers and validation (no database).
 * Database-backed behaviour: tests/integration/admin.test.js.
 */
process.env.NODE_ENV = 'test';

const config = require('../src/config/environment');
const { resolveRange, maskMobile } = require('../src/services/adminService');
const v = require('../src/validators/adminValidator');

describe('resolveRange', () => {
  const now = new Date('2026-10-24T15:30:00Z');

  it('defaults to the last 30 days (whole UTC days)', () => {
    const { start, end } = resolveRange({}, now);
    expect(start.toISOString()).toBe('2026-09-25T00:00:00.000Z');
    expect(end).toEqual(now);
  });

  it('accepts an explicit inclusive range', () => {
    const { start, end } = resolveRange({ from: '2026-10-01', to: '2026-10-07' }, now);
    expect([start.toISOString(), end.toISOString()]).toEqual(['2026-10-01T00:00:00.000Z', '2026-10-07T23:59:59.999Z']);
  });

  it('rejects reversed and too-long ranges', () => {
    expect(() => resolveRange({ from: '2026-10-07', to: '2026-10-01' }, now)).toThrow('Validation failed');
    expect(() => resolveRange({ from: '2020-01-01', to: '2026-01-01' }, now)).toThrow('Validation failed');
  });
});

describe('maskMobile', () => {
  it('keeps only the last three digits', () => {
    expect(maskMobile('+919876543210')).toBe('••••••••••210');
    expect(maskMobile(null)).toBeNull();
  });
});

describe('admin validation', () => {
  it('bounds pagination and filters', () => {
    expect(v.listUsersQuery.parse({})).toEqual({ page: 1, limit: config.admin.defaultPageSize });
    expect(v.listUsersQuery.safeParse({ limit: config.admin.maxPageSize + 1 }).success).toBe(false);
    expect(v.listUsersQuery.safeParse({ status: 'frozen' }).success).toBe(false);
    expect(v.listReportsQuery.parse({ status: 'pending' })).toMatchObject({ status: 'pending', sort: 'oldest' });
    expect(v.rangeQuery.safeParse({ from: '2026-02-30' }).success).toBe(false);
  });

  it('requires a reason to suspend, allows only active/suspended, and rejects extra fields', () => {
    expect(v.userStatusBody.safeParse({ status: 'suspended' }).success).toBe(false);
    expect(v.userStatusBody.safeParse({ status: 'suspended', reason: 'Spam account' }).success).toBe(true);
    expect(v.userStatusBody.safeParse({ status: 'active' }).success).toBe(true);
    expect(v.userStatusBody.safeParse({ status: 'deleted', reason: 'x' }).success).toBe(false);
    expect(v.userStatusBody.safeParse({ status: 'active', role: 'admin' }).success).toBe(false);
  });

  it('allows only real moderation decisions on reports', () => {
    expect(v.reportStatusBody.safeParse({ status: 'resolved', actionTaken: 'warning' }).success).toBe(true);
    for (const body of [{ status: 'pending' }, { status: 'resolved', actionTaken: 'banned' }, { status: 'resolved', reviewedBy: 1 }]) {
      expect(v.reportStatusBody.safeParse(body).success).toBe(false);
    }
  });
});
