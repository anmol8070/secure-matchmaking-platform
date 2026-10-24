// Single source of truth for route paths — import these instead of hard-coding strings.
export const USER_PATHS = {
  HOME: '/',
  REGISTER: '/register',
  OTP_VERIFICATION: '/otp-verification',
  LOGIN: '/login',
  LOGIN_VERIFICATION: '/login-verification',
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  PROFILE_CREATE: '/profile/create',
  PROFILE_EDIT: '/profile/edit',
  PREFERENCES: '/preferences',
  PREFERENCES_QUIZ: '/preferences/quiz',
  MATCHES: '/matches',
  CONNECTIONS: '/connections',
  CONNECTION_REQUESTS: '/connections/requests',
  MESSAGES: '/messages',
  CHAT: '/chat/:userId',
  VIDEO: '/video',
  CALLS: '/calls',
  PRIVACY: '/privacy',
  BLOCKED_USERS: '/privacy/blocked',
};

/** /video?with=<userId> starts a video call. */
export const videoCallPath = (userId) => `/video?with=${userId}`;

/** /chat/:userId for one conversation. */
export const chatPath = (userId) => `/chat/${userId}`;

export const ADMIN_PATHS = {
  ROOT: '/admin',
  LOGIN: '/admin/login',
  DASHBOARD: '/admin/dashboard',
  USERS: '/admin/users',
  USER: '/admin/users/:id',
  REPORTS: '/admin/reports',
  REPORT: '/admin/reports/:id',
  ACTIVITY: '/admin/activity',
  ML: '/admin/ml-monitoring',
};

export const adminUserPath = (id) => `/admin/users/${id}`;
export const adminReportPath = (id) => `/admin/reports/${id}`;
