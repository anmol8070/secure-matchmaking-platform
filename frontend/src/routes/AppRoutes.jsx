import { Navigate, Route, Routes } from 'react-router-dom';

import UserLayout from '../layouts/UserLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';

import Home from '../pages/user/Home.jsx';
import Register from '../pages/user/Register.jsx';
import VerifyOtp from '../pages/user/VerifyOtp.jsx';
import Login from '../pages/user/Login.jsx';

import AdminLogin from '../pages/admin/AdminLogin.jsx';
import AdminDashboard from '../pages/admin/AdminDashboard.jsx';

import NotFound from '../pages/NotFound.jsx';
import { ADMIN_PATHS, USER_PATHS } from './paths.js';

// Route guards (authenticated user / admin) will wrap these groups in Phase 3.
function AppRoutes() {
  return (
    <Routes>
      {/* User panel */}
      <Route element={<UserLayout />}>
        <Route path={USER_PATHS.HOME} element={<Home />} />
        <Route path={USER_PATHS.REGISTER} element={<Register />} />
        <Route path={USER_PATHS.VERIFY_OTP} element={<VerifyOtp />} />
        <Route path={USER_PATHS.LOGIN} element={<Login />} />
      </Route>

      {/* Admin panel */}
      <Route path={ADMIN_PATHS.ROOT} element={<AdminLayout />}>
        <Route index element={<Navigate to={ADMIN_PATHS.DASHBOARD} replace />} />
        <Route path={ADMIN_PATHS.LOGIN} element={<AdminLogin />} />
        <Route path={ADMIN_PATHS.DASHBOARD} element={<AdminDashboard />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default AppRoutes;
