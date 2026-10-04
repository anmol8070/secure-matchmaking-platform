/**
 * The single source of authentication state for the whole app.
 * Components read it with useAuth() — never keep their own copy.
 */
import { createContext, useCallback, useEffect, useMemo, useReducer } from 'react';
import { authService } from '../services/authService.js';
import { onUnauthorized } from '../services/apiClient.js';
import { isTokenExpired, tokenStore } from '../services/tokenStore.js';
import { AUTH_STATUS, authReducer, initialAuthState } from './authReducer.js';

export const AuthContext = createContext(null);

const toVerification = (data, context) => ({
  token: data.verification_token,
  expiresAt: Date.now() + data.verification_expires_in * 1000,
  context,
});

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  const expireSession = useCallback(() => {
    tokenStore.clear();
    dispatch({ type: 'SESSION_EXPIRED' });
  }, []);

  // Restore a stored session on load.
  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      dispatch({ type: 'RESTORE_NONE' });
      return undefined;
    }
    if (isTokenExpired(token)) {
      expireSession();
      return undefined;
    }
    let cancelled = false;
    authService
      .me()
      .then(({ data }) => !cancelled && dispatch({ type: 'AUTHENTICATED', user: data }))
      .catch(() => !cancelled && expireSession());
    return () => {
      cancelled = true;
    };
  }, [expireSession]);

  // Any authenticated request that gets 401 ends the session.
  useEffect(() => onUnauthorized(expireSession), [expireSession]);

  /** Runs a step-1 login call; on success the app moves to live verification. */
  const runLoginStep = useCallback(async (call, context) => {
    dispatch({ type: 'AUTH_START' });
    try {
      const { data } = await call();
      dispatch({ type: 'CREDENTIALS_VERIFIED', verification: toVerification(data, context) });
    } catch (err) {
      dispatch({ type: 'AUTH_FAILED' });
      throw err;
    }
  }, []);

  const loginWithPassword = useCallback(
    (identifier, password, { admin = false } = {}) =>
      runLoginStep(
        () => (admin ? authService.adminLogin(identifier, password) : authService.login(identifier, password)),
        admin ? 'admin' : 'user'
      ),
    [runLoginStep]
  );

  const loginWithOtp = useCallback(
    (identifier, otp) => runLoginStep(() => authService.verifyLoginOtp(identifier, otp), 'user'),
    [runLoginStep]
  );

  const startLiveVerification = useCallback(() => dispatch({ type: 'LIVE_VERIFICATION_STARTED' }), []);

  /**
   * Submits the detection result. Resolves with the user on success.
   * On failure it only throws: the caller decides whether to retry or to call
   * abandonVerification(message).
   */
  const completeLiveVerification = useCallback(
    async (detection) => {
      const { verification } = state;
      if (!verification || verification.expiresAt <= Date.now()) {
        throw Object.assign(new Error('Your verification session has expired. Please log in again.'), {
          status: 401,
        });
      }
      const { data } = await authService.completeLoginVerification(verification.token, detection);
      tokenStore.set(data.access_token);
      dispatch({ type: 'AUTHENTICATED', user: data.user });
      return data.user;
    },
    [state]
  );

  /**
   * Ends an unfinished login (expired/used session, too many attempts, cancel).
   * The optional message is kept as `notice` and shown on the login page.
   */
  const abandonVerification = useCallback((message) => dispatch({ type: 'VERIFICATION_ENDED', message }), []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Even if the server call fails, the local session ends.
    }
    tokenStore.clear();
    dispatch({ type: 'LOGGED_OUT' });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === AUTH_STATUS.AUTHENTICATED,
      isAdmin: state.status === AUTH_STATUS.AUTHENTICATED && state.user?.role === 'admin',
      loginWithPassword,
      loginWithOtp,
      startLiveVerification,
      completeLiveVerification,
      abandonVerification,
      logout,
    }),
    [state, loginWithPassword, loginWithOtp, startLiveVerification, completeLiveVerification, abandonVerification, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
