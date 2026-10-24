/**
 * The single source of authentication state for the whole app.
 * Components read it with useAuth() — never keep their own copy.
 */
import { createContext, useCallback, useEffect, useMemo, useReducer } from 'react';
import { authService } from '../services/authService.js';
import { onUnauthorized } from '../services/apiClient.js';
import { isTokenExpired, tokenStore } from '../services/tokenStore.js';
import { socketService } from '../services/socketService.js';
import { AUTH_STATUS, authReducer, initialAuthState } from './authReducer.js';

export const AuthContext = createContext(null);

// Restoring a stored session: attempts and backoff for temporary failures.
const RESTORE_ATTEMPTS = 3;
const RESTORE_RETRY_MS = 1000;

// returnTo: the protected page the visitor asked for (checked by landingPath before use).
const toVerification = (data, context, returnTo) => ({
  token: data.verification_token,
  expiresAt: Date.now() + data.verification_expires_in * 1000,
  context,
  returnTo: returnTo || null,
  hasProfilePhoto: Boolean(data.has_profile_photo),
});

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  const expireSession = useCallback(() => {
    socketService.disconnect();
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
    let timer = null;
    // Only a 401/403 means the session is over. A temporary failure (offline,
    // rate limit, server error) is retried a few times before giving up, so a
    // network blip does not sign the user out.
    const restore = (attempt) =>
      authService
        .me()
        .then(({ data }) => !cancelled && dispatch({ type: 'AUTHENTICATED', user: data }))
        .catch((err) => {
          if (cancelled) return;
          const sessionOver = err?.status === 401 || err?.status === 403;
          if (sessionOver || attempt >= RESTORE_ATTEMPTS) expireSession();
          else timer = setTimeout(() => restore(attempt + 1), RESTORE_RETRY_MS * attempt);
        });
    restore(1);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [expireSession]);

  // Any authenticated request that gets 401 ends the session.
  useEffect(() => onUnauthorized(expireSession), [expireSession]);

  /** Runs a step-1 login call; on success the app moves to live verification. */
  const runLoginStep = useCallback(async (call, context, returnTo) => {
    dispatch({ type: 'AUTH_START' });
    try {
      const { data } = await call();
      dispatch({ type: 'CREDENTIALS_VERIFIED', verification: toVerification(data, context, returnTo) });
    } catch (err) {
      dispatch({ type: 'AUTH_FAILED' });
      throw err;
    }
  }, []);

  const loginWithPassword = useCallback(
    (identifier, password, { admin = false, returnTo } = {}) =>
      runLoginStep(
        () => (admin ? authService.adminLogin(identifier, password) : authService.login(identifier, password)),
        admin ? 'admin' : 'user',
        returnTo
      ),
    [runLoginStep]
  );

  const loginWithOtp = useCallback(
    (identifier, otp, { returnTo } = {}) => runLoginStep(() => authService.verifyLoginOtp(identifier, otp), 'user', returnTo),
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
    socketService.disconnect();
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
