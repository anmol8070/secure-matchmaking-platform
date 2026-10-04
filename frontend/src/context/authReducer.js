/**
 * Central authentication state machine (used by AuthContext).
 *
 *  LOGGED_OUT ──login──► AUTH_PENDING ──ok──► CREDENTIALS_VERIFIED
 *                              │                     │ camera step
 *                              └─fail─► LOGGED_OUT   ▼
 *                                         LIVE_VERIFICATION_PENDING
 *                                                    │ one face
 *                                                    ▼
 *                    SESSION_EXPIRED ◄──401── AUTHENTICATED ──logout──► LOGGED_OUT
 */
export const AUTH_STATUS = Object.freeze({
  LOGGED_OUT: 'logged_out',
  AUTH_PENDING: 'authentication_pending',
  CREDENTIALS_VERIFIED: 'credentials_verified',
  LIVE_VERIFICATION_PENDING: 'live_verification_pending',
  AUTHENTICATED: 'authenticated',
  SESSION_EXPIRED: 'session_expired',
});

export const initialAuthState = {
  status: AUTH_STATUS.AUTH_PENDING, // restoring a stored session on load
  user: null,
  // { token, expiresAt, context: 'user' | 'admin' } — memory only, never persisted
  verification: null,
  // Why the last login attempt ended: { message, context } — shown on the login page
  notice: null,
};

export function authReducer(state, action) {
  switch (action.type) {
    case 'RESTORE_NONE':
      return { ...initialAuthState, status: AUTH_STATUS.LOGGED_OUT };
    case 'AUTH_START':
      return { ...state, status: AUTH_STATUS.AUTH_PENDING, notice: null };
    case 'AUTH_FAILED':
      return { ...state, status: AUTH_STATUS.LOGGED_OUT, verification: null };
    case 'CREDENTIALS_VERIFIED':
      return {
        status: AUTH_STATUS.CREDENTIALS_VERIFIED,
        user: null,
        verification: action.verification,
        notice: null,
      };
    case 'LIVE_VERIFICATION_STARTED':
      return state.verification ? { ...state, status: AUTH_STATUS.LIVE_VERIFICATION_PENDING } : state;
    case 'AUTHENTICATED':
      return { status: AUTH_STATUS.AUTHENTICATED, user: action.user, verification: null, notice: null };
    case 'VERIFICATION_ENDED':
      return {
        status: AUTH_STATUS.LOGGED_OUT,
        user: null,
        verification: null,
        notice: action.message ? { message: action.message, context: state.verification?.context || 'user' } : null,
      };
    case 'LOGGED_OUT':
      return { status: AUTH_STATUS.LOGGED_OUT, user: null, verification: null, notice: null };
    case 'SESSION_EXPIRED':
      return {
        status: AUTH_STATUS.SESSION_EXPIRED,
        user: null,
        verification: null,
        notice: { message: 'Your session has expired. Please log in again.', context: 'user' },
      };
    default:
      return state;
  }
}
