/**
 * Access-token storage — the only place the token is kept in the browser.
 *
 * sessionStorage: survives page reloads, is cleared when the tab closes and is
 * not shared with other tabs. The temporary login verification token is NOT
 * stored here; it lives only in memory (AuthContext).
 */
const KEY = 'mm.accessToken';

export const tokenStore = {
  get() {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      // Storage unavailable (private mode): the session lasts until reload.
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  },
};

/** Reads the `exp` claim without verifying (the server always verifies). */
export function isTokenExpired(token, now = Date.now()) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= now;
  } catch {
    return true;
  }
}
