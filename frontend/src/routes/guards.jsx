/**
 * Route guards driven by the central auth state.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import { AUTH_STATUS } from '../context/authReducer.js';
import { ADMIN_PATHS, USER_PATHS } from './paths.js';

function Loading() {
  return (
    <p className="muted" role="status">
      Loading…
    </p>
  );
}

/** Fully authenticated users only (credentials + live verification done). */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === AUTH_STATUS.AUTH_PENDING) return <Loading />;
  if (status !== AUTH_STATUS.AUTHENTICATED) {
    return <Navigate to={USER_PATHS.LOGIN} replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Authenticated admins only. */
export function AdminRoute() {
  const { status, isAdmin } = useAuth();
  if (status === AUTH_STATUS.AUTH_PENDING) return <Loading />;
  if (status !== AUTH_STATUS.AUTHENTICATED) return <Navigate to={ADMIN_PATHS.LOGIN} replace />;
  if (!isAdmin) return <Navigate to={USER_PATHS.DASHBOARD} replace />;
  return <Outlet />;
}

/** The live verification step is only reachable after credentials/OTP succeeded. */
export function VerificationRoute() {
  const { status, verification, isAdmin, notice } = useAuth();
  if (status === AUTH_STATUS.AUTHENTICATED) {
    return <Navigate to={isAdmin ? ADMIN_PATHS.DASHBOARD : USER_PATHS.DASHBOARD} replace />;
  }
  if (!verification) {
    return <Navigate to={notice?.context === 'admin' ? ADMIN_PATHS.LOGIN : USER_PATHS.LOGIN} replace />;
  }
  return <Outlet />;
}

/** Login/register pages redirect away once fully signed in. */
export function GuestRoute() {
  const { status, isAdmin } = useAuth();
  if (status === AUTH_STATUS.AUTHENTICATED) {
    return <Navigate to={isAdmin ? ADMIN_PATHS.DASHBOARD : USER_PATHS.DASHBOARD} replace />;
  }
  return <Outlet />;
}
