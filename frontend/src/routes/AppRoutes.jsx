import { Navigate, Route, Routes } from 'react-router-dom';

import UserLayout from '../layouts/UserLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';

import Home from '../pages/user/Home.jsx';
import Register from '../pages/user/Register.jsx';
import OtpVerification from '../pages/user/OtpVerification.jsx';
import Login from '../pages/user/Login.jsx';
import LoginVerification from '../pages/user/LoginVerification.jsx';
import Dashboard from '../pages/user/Dashboard.jsx';

import AdminLogin from '../pages/admin/AdminLogin.jsx';
import AdminDashboard from '../pages/admin/AdminDashboard.jsx';

import PagePlaceholder from '../components/common/PagePlaceholder.jsx';
import NotFound from '../pages/NotFound.jsx';
import { AdminRoute, GuestRoute, ProtectedRoute, VerificationRoute } from './guards.jsx';
import { ADMIN_PATHS, USER_PATHS } from './paths.js';

// Protected feature pages built in later phases.
const UPCOMING_PAGES = [
  [USER_PATHS.PROFILE, 'Your profile'],
  [USER_PATHS.PREFERENCES, 'Preferences'],
  [USER_PATHS.MATCHES, 'Matches'],
  [USER_PATHS.CONNECTIONS, 'Connections'],
  [USER_PATHS.MESSAGES, 'Messages'],
];

function AppRoutes() {
  return (
    <Routes>
      {/* User panel */}
      <Route element={<UserLayout />}>
        <Route path={USER_PATHS.HOME} element={<Home />} />

        <Route element={<GuestRoute />}>
          <Route path={USER_PATHS.REGISTER} element={<Register />} />
          <Route path={USER_PATHS.OTP_VERIFICATION} element={<OtpVerification />} />
          <Route path={USER_PATHS.LOGIN} element={<Login />} />
        </Route>

        <Route element={<VerificationRoute />}>
          <Route path={USER_PATHS.LOGIN_VERIFICATION} element={<LoginVerification />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path={USER_PATHS.DASHBOARD} element={<Dashboard />} />
          {UPCOMING_PAGES.map(([path, title]) => (
            <Route key={path} path={path} element={<PagePlaceholder title={title} />} />
          ))}
        </Route>
      </Route>

      {/* Admin panel */}
      <Route path={ADMIN_PATHS.ROOT} element={<AdminLayout />}>
        <Route index element={<Navigate to={ADMIN_PATHS.DASHBOARD} replace />} />
        <Route element={<GuestRoute />}>
          <Route path={ADMIN_PATHS.LOGIN} element={<AdminLogin />} />
        </Route>
        <Route element={<AdminRoute />}>
          <Route path={ADMIN_PATHS.DASHBOARD} element={<AdminDashboard />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
