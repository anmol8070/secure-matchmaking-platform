/**
 * Where to go after sign-in. A protected page the visitor asked for is
 * remembered (in memory, through the login → live verification steps) and
 * used only if it is an internal path the account may open — never an
 * external URL (no open redirect) and never the sign-in pages themselves.
 */
import { ADMIN_PATHS, USER_PATHS } from './paths.js';

const SIGN_IN_PATHS = [
  USER_PATHS.LOGIN,
  USER_PATHS.REGISTER,
  USER_PATHS.OTP_VERIFICATION,
  USER_PATHS.LOGIN_VERIFICATION,
  ADMIN_PATHS.LOGIN,
];

/** The remembered path if it is safe for this account, otherwise null. */
export function safeReturnPath(path, isAdmin) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  const pathname = path.split(/[?#]/)[0];
  if (SIGN_IN_PATHS.includes(pathname) || pathname === USER_PATHS.HOME) return null;
  const adminArea = pathname === ADMIN_PATHS.ROOT || pathname.startsWith(`${ADMIN_PATHS.ROOT}/`);
  return adminArea === Boolean(isAdmin) ? path : null;
}

/** Landing page for a freshly signed-in user. */
export function landingPath(user, returnTo) {
  const isAdmin = user?.role === 'admin';
  return safeReturnPath(returnTo, isAdmin) || (isAdmin ? ADMIN_PATHS.DASHBOARD : USER_PATHS.DASHBOARD);
}
