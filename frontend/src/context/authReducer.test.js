import { describe, expect, it } from 'vitest';
import { AUTH_STATUS, authReducer, initialAuthState } from './authReducer.js';

const verification = { token: 't', expiresAt: Date.now() + 60000, context: 'user' };
const loggedOut = { ...initialAuthState, status: AUTH_STATUS.LOGGED_OUT };

describe('authReducer', () => {
  it('starts in authentication-pending while restoring a session', () => {
    expect(initialAuthState.status).toBe(AUTH_STATUS.AUTH_PENDING);
    expect(authReducer(initialAuthState, { type: 'RESTORE_NONE' }).status).toBe(AUTH_STATUS.LOGGED_OUT);
  });

  it('walks the full login flow: pending → credentials verified → live verification → authenticated', () => {
    let state = authReducer(loggedOut, { type: 'AUTH_START' });
    expect(state.status).toBe(AUTH_STATUS.AUTH_PENDING);

    state = authReducer(state, { type: 'CREDENTIALS_VERIFIED', verification });
    expect(state).toMatchObject({ status: AUTH_STATUS.CREDENTIALS_VERIFIED, verification, user: null });

    state = authReducer(state, { type: 'LIVE_VERIFICATION_STARTED' });
    expect(state.status).toBe(AUTH_STATUS.LIVE_VERIFICATION_PENDING);

    state = authReducer(state, { type: 'AUTHENTICATED', user: { user_id: 1 } });
    expect(state).toEqual({ status: AUTH_STATUS.AUTHENTICATED, user: { user_id: 1 }, verification: null, notice: null });
  });

  it('cannot enter live verification without verified credentials', () => {
    expect(authReducer(loggedOut, { type: 'LIVE_VERIFICATION_STARTED' })).toBe(loggedOut);
  });

  it('returns to logged out on failure, ended verification and logout', () => {
    const pending = { status: AUTH_STATUS.LIVE_VERIFICATION_PENDING, user: null, verification, notice: null };
    for (const type of ['AUTH_FAILED', 'VERIFICATION_ENDED', 'LOGGED_OUT']) {
      const next = authReducer(pending, { type });
      expect(next.status).toBe(AUTH_STATUS.LOGGED_OUT);
      expect(next.verification).toBeNull();
    }
  });

  it('keeps the reason an unfinished login ended, for the matching login page', () => {
    const admin = { status: AUTH_STATUS.LIVE_VERIFICATION_PENDING, user: null, verification: { ...verification, context: 'admin' } };
    const next = authReducer(admin, { type: 'VERIFICATION_ENDED', message: 'Expired' });
    expect(next.notice).toEqual({ message: 'Expired', context: 'admin' });

    // The next login attempt clears it.
    expect(authReducer(next, { type: 'AUTH_START' }).notice).toBeNull();
  });

  it('marks an expired session', () => {
    const state = authReducer({ status: AUTH_STATUS.AUTHENTICATED, user: { user_id: 1 }, verification: null }, { type: 'SESSION_EXPIRED' });
    expect(state).toEqual({
      status: AUTH_STATUS.SESSION_EXPIRED,
      user: null,
      verification: null,
      notice: { message: 'Your session has expired. Please log in again.', context: 'user' },
    });
  });
});
