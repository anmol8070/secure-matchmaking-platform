/**
 * DEVELOPMENT ONLY — calls the backend's dev OTP outbox (mounted only when the
 * backend runs outside production with OTP_PROVIDER=dev). Imported only by
 * DevOtpHint, so it is tree-shaken out of production builds.
 */
import { apiClient } from './apiClient.js';

export const devService = {
  latestOtp: (destination) => apiClient.get(`/dev/otp?destination=${encodeURIComponent(destination.trim())}`),
};
