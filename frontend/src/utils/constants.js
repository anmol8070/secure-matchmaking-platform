export const APP_NAME = 'Matchmaking Platform';

/**
 * Public API origin. Not a secret. Production builds use this when
 * VITE_API_BASE_URL is missing or points at a private development host.
 * The client appends /api/v1 exactly once; service paths stay relative
 * (`/health`, `/auth/login`, …).
 */
export const PRODUCTION_API_ORIGIN = 'https://secure-matchmaking-platform.onrender.com';
export const PRODUCTION_API_BASE_URL = `${PRODUCTION_API_ORIGIN}/api/v1`;

/** True for localhost, loopback, .local, and private IPv4 literals. */
export function isPrivateDevUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return true;
    }
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  } catch {
    return true;
  }
}

/**
 * Ensures the base ends with /api/v1 exactly once.
 * An origin-only value (`https://host`) gains the prefix; a value that
 * already ends with /api/v1 is left unchanged.
 */
export function normalizeApiBase(value) {
  const trimmed = String(value).trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (url.pathname.replace(/\/+$/, '') === '') {
      url.pathname = '/api/v1';
      return url.toString().replace(/\/+$/, '');
    }
    return trimmed;
  } catch {
    if (/\/api\/v1$/i.test(trimmed)) return trimmed;
    return `${trimmed}/api/v1`;
  }
}

function productionApiBase(configured) {
  const trimmed = String(configured ?? '').trim();
  if (trimmed && !isPrivateDevUrl(trimmed)) return normalizeApiBase(trimmed);
  return PRODUCTION_API_BASE_URL;
}

function developmentApiBase(configured) {
  const trimmed = String(configured ?? '').trim();
  return normalizeApiBase(trimmed || 'http://localhost:5000/api/v1');
}

/**
 * Resolves the REST base URL.
 * `production: true` never returns a private development host.
 */
export function resolveApiBaseUrl(configured, { production = false } = {}) {
  return production ? productionApiBase(configured) : developmentApiBase(configured);
}

// Vite replaces import.meta.env.PROD at build time and drops the unused branch.
// Set VITE_API_BASE_URL in frontend/.env.development, frontend/.env.production,
// or the host's environment. Only VITE_-prefixed names reach the browser.
export const API_BASE_URL = import.meta.env.PROD
  ? productionApiBase(import.meta.env.VITE_API_BASE_URL)
  : developmentApiBase(import.meta.env.VITE_API_BASE_URL);
