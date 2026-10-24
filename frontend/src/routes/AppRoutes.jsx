import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import UserLayout from '../layouts/UserLayout.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';

import Home from '../pages/user/Home.jsx';
import Register from '../pages/user/Register.jsx';
import OtpVerification from '../pages/user/OtpVerification.jsx';
import Login from '../pages/user/Login.jsx';
import LoginVerification from '../pages/user/LoginVerification.jsx';
import Dashboard from '../pages/user/Dashboard.jsx';
import ProfilePage from '../pages/user/profile/ProfilePage.jsx';
import ProfileCreate from '../pages/user/profile/ProfileCreate.jsx';
import ProfileEdit from '../pages/user/profile/ProfileEdit.jsx';
import PreferencesPage from '../pages/user/preferences/PreferencesPage.jsx';
import QuizPage from '../pages/user/preferences/QuizPage.jsx';

import AdminLogin from '../pages/admin/AdminLogin.jsx';

import NotFound from '../pages/NotFound.jsx';
import { AdminRoute, GuestRoute, ProtectedRoute, VerificationRoute } from './guards.jsx';
import { ADMIN_PATHS, USER_PATHS } from './paths.js';

import RecommendedMatches from '../pages/user/matches/RecommendedMatches.jsx';
import Connections from '../pages/connections/Connections.jsx';
import ConnectionRequests from '../pages/connections/ConnectionRequests.jsx';
import Messages from '../pages/chat/Messages.jsx';
import PrivateChat from '../pages/chat/PrivateChat.jsx';
import CallHistory from '../pages/video/CallHistory.jsx';
import PrivacySettings from '../pages/privacy/PrivacySettings.jsx';
import BlockedUsers from '../pages/privacy/BlockedUsers.jsx';

// Loaded on first visit (the layouts wrap their outlet in <Suspense>): members never
// download the admin panel, and the WebRTC call page is only fetched when a call starts.
const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard.jsx'));
const AdminUsers = lazy(() => import('../pages/admin/AdminUsers.jsx'));
const AdminUserDetails = lazy(() => import('../pages/admin/AdminUserDetails.jsx'));
const AdminReports = lazy(() => import('../pages/admin/AdminReports.jsx'));
const AdminReportDetails = lazy(() => import('../pages/admin/AdminReportDetails.jsx'));
const AdminActivity = lazy(() => import('../pages/admin/AdminActivity.jsx'));
const AdminMLMonitoring = lazy(() => import('../pages/admin/AdminMLMonitoring.jsx'));
const VideoCall = lazy(() => import('../pages/video/VideoCall.jsx'));

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
          <Route path={USER_PATHS.PROFILE} element={<ProfilePage />} />
          <Route path={USER_PATHS.PROFILE_CREATE} element={<ProfileCreate />} />
          <Route path={USER_PATHS.PROFILE_EDIT} element={<ProfileEdit />} />
          <Route path={USER_PATHS.PREFERENCES} element={<PreferencesPage />} />
          <Route path={USER_PATHS.PREFERENCES_QUIZ} element={<QuizPage />} />
          <Route path={USER_PATHS.MATCHES} element={<RecommendedMatches />} />
          <Route path={USER_PATHS.CONNECTIONS} element={<Connections />} />
          <Route path={USER_PATHS.CONNECTION_REQUESTS} element={<ConnectionRequests />} />
          <Route path={USER_PATHS.MESSAGES} element={<Messages />} />
          <Route path={USER_PATHS.CHAT} element={<PrivateChat />} />
          <Route path={USER_PATHS.VIDEO} element={<VideoCall />} />
          <Route path={USER_PATHS.CALLS} element={<CallHistory />} />
          <Route path={USER_PATHS.PRIVACY} element={<PrivacySettings />} />
          <Route path={USER_PATHS.BLOCKED_USERS} element={<BlockedUsers />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Admin panel */}
      <Route path={ADMIN_PATHS.ROOT} element={<AdminLayout />}>
        <Route index element={<Navigate to={ADMIN_PATHS.DASHBOARD} replace />} />
        <Route element={<GuestRoute />}>
          <Route path={ADMIN_PATHS.LOGIN} element={<AdminLogin />} />
        </Route>
        <Route element={<AdminRoute />}>
          <Route path={ADMIN_PATHS.DASHBOARD} element={<AdminDashboard />} />
          <Route path={ADMIN_PATHS.USERS} element={<AdminUsers />} />
          <Route path={ADMIN_PATHS.USER} element={<AdminUserDetails />} />
          <Route path={ADMIN_PATHS.REPORTS} element={<AdminReports />} />
          <Route path={ADMIN_PATHS.REPORT} element={<AdminReportDetails />} />
          <Route path={ADMIN_PATHS.ACTIVITY} element={<AdminActivity />} />
          <Route path={ADMIN_PATHS.ML} element={<AdminMLMonitoring />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;
