import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiClient, onUnauthorized, toQueryString } from './apiClient.js';
import { tokenStore } from './tokenStore.js';

function respond(status, body = { success: status < 400, message: `status ${status}` }) {
  global.fetch = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body }));
  return global.fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('apiClient', () => {
  it('turns params into a query string and skips empty values', async () => {
    const fetch = respond(200, { success: true, data: {} });
    await apiClient.get('/matches', { params: { page: 2, limit: 12, location: 'Pune', minAge: '', maxAge: undefined, x: null } });
    expect(fetch.mock.calls[0][0]).toMatch(/\/matches\?page=2&limit=12&location=Pune$/);
    expect(toQueryString({})).toBe('');
    expect(toQueryString({ q: 'a b&c' })).toBe('?q=a+b%26c');
  });

  it('sends the bearer token only on authenticated requests', async () => {
    tokenStore.set('a.b.c');
    const fetch = respond(200);
    await apiClient.get('/health');
    await apiClient.get('/auth/me', { auth: true });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer a.b.c');
  });

  it('ends the session on 401 but not on 403', async () => {
    const handler = vi.fn();
    const off = onUnauthorized(handler);
    respond(403, { success: false, message: 'This profile is not accessible' });
    const forbidden = await apiClient.get('/matches/9', { auth: true }).catch((e) => e);
    expect(forbidden).toBeInstanceOf(ApiRequestError);
    expect(forbidden.status).toBe(403);
    expect(forbidden.message).toBe('This profile is not accessible');
    expect(handler).not.toHaveBeenCalled();

    respond(401, { success: false, message: 'Invalid or expired token' });
    const unauthorized = await apiClient.get('/matches', { auth: true }).catch((e) => e);
    expect(unauthorized.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    off();
  });

  it('reports a network failure with a readable message', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await apiClient.get('/health').catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/cannot reach the server/i);
  });
});
