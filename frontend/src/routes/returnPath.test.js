import { describe, expect, it } from 'vitest';
import { landingPath, safeReturnPath } from './returnPath.js';

describe('return path after sign-in', () => {
  it('keeps an internal member page, including its query', () => {
    expect(safeReturnPath('/chat/9', false)).toBe('/chat/9');
    expect(safeReturnPath('/video?with=9', false)).toBe('/video?with=9');
  });

  it('rejects external and protocol-relative URLs (no open redirect)', () => {
    for (const bad of ['https://evil.example', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', '', null, undefined, 42]) {
      expect(safeReturnPath(bad, false)).toBeNull();
      expect(safeReturnPath(bad, true)).toBeNull();
    }
  });

  it('never returns to the sign-in pages or home', () => {
    for (const p of ['/login', '/register', '/otp-verification', '/login-verification', '/admin/login', '/']) {
      expect(safeReturnPath(p, false)).toBeNull();
      expect(safeReturnPath(p, true)).toBeNull();
    }
  });

  it('sends members only to member pages and admins only to admin pages', () => {
    expect(safeReturnPath('/admin/users', false)).toBeNull();
    expect(safeReturnPath('/admin', false)).toBeNull();
    expect(safeReturnPath('/admin/users/3', true)).toBe('/admin/users/3');
    expect(safeReturnPath('/matches', true)).toBeNull();
    // A look-alike prefix is not the admin area.
    expect(safeReturnPath('/administrator', false)).toBe('/administrator');
  });

  it('falls back to the dashboard for the role', () => {
    expect(landingPath({ role: 'user' }, null)).toBe('/dashboard');
    expect(landingPath({ role: 'admin' }, '/matches')).toBe('/admin/dashboard');
    expect(landingPath({ role: 'user' }, '/privacy')).toBe('/privacy');
  });
});
