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
  MESSAGES: '/messages',
};

export const ADMIN_PATHS = {
  ROOT: '/admin',
  LOGIN: '/admin/login',
  DASHBOARD: '/admin/dashboard',
};
