import { describe, expect, it } from 'vitest';
import {
  API_BASE_URL,
  PRODUCTION_API_BASE_URL,
  isPrivateDevUrl,
  normalizeApiBase,
  resolveApiBaseUrl,
} from './constants.js';

describe('API base URL', () => {
  it('points production at the Render API and appends /api/v1 once', () => {
    expect(resolveApiBaseUrl(undefined, { production: true })).toBe(PRODUCTION_API_BASE_URL);
    expect(resolveApiBaseUrl('', { production: true })).toBe(
      'https://secure-matchmaking-platform.onrender.com/api/v1'
    );
    expect(resolveApiBaseUrl('https://secure-matchmaking-platform.onrender.com', { production: true })).toBe(
      'https://secure-matchmaking-platform.onrender.com/api/v1'
    );
    expect(resolveApiBaseUrl('https://secure-matchmaking-platform.onrender.com/api/v1/', { production: true })).toBe(
      'https://secure-matchmaking-platform.onrender.com/api/v1'
    );
    expect(PRODUCTION_API_BASE_URL).not.toMatch(/\/api\/v1\/api\/v1/);
  });

  it('never uses a private host in production, even when the env var says so', () => {
    for (const configured of [
      'http://localhost:5000/api/v1',
      'http://127.0.0.1:5000/api/v1',
      'http://0.0.0.0:5000/api/v1',
      'http://[::1]:5000/api/v1',
      'http://192.168.1.20:5000/api/v1',
      'http://10.0.0.5:5000/api/v1',
    ]) {
      expect(isPrivateDevUrl(configured)).toBe(true);
      expect(resolveApiBaseUrl(configured, { production: true })).toBe(PRODUCTION_API_BASE_URL);
    }
  });

  it('keeps an explicit public production URL', () => {
    expect(resolveApiBaseUrl('https://api.example.com/api/v1', { production: true })).toBe(
      'https://api.example.com/api/v1'
    );
  });

  it('keeps local development on the local backend unless a public URL is set', () => {
    expect(resolveApiBaseUrl(undefined, { production: false })).toBe('http://localhost:5000/api/v1');
    expect(resolveApiBaseUrl('http://127.0.0.1:5000', { production: false })).toBe('http://127.0.0.1:5000/api/v1');
    expect(resolveApiBaseUrl('https://secure-matchmaking-platform.onrender.com/api/v1', { production: false })).toBe(
      'https://secure-matchmaking-platform.onrender.com/api/v1'
    );
  });

  it('does not duplicate the /api/v1 prefix', () => {
    expect(normalizeApiBase('https://secure-matchmaking-platform.onrender.com')).toBe(
      'https://secure-matchmaking-platform.onrender.com/api/v1'
    );
    expect(normalizeApiBase('https://secure-matchmaking-platform.onrender.com/api/v1')).toBe(
      'https://secure-matchmaking-platform.onrender.com/api/v1'
    );
  });

  it('uses a development URL while tests run (production mode is off)', () => {
    expect(API_BASE_URL).toMatch(/^https?:\/\/.+/);
    expect(API_BASE_URL.endsWith('/api/v1')).toBe(true);
    expect(API_BASE_URL).not.toMatch(/\/api\/v1\/api\/v1/);
  });
});
