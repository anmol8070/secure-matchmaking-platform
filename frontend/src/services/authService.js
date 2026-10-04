/**
 * Authentication API calls. Business rules live on the server; this module
 * only maps UI actions to endpoints.
 */
import { apiClient } from './apiClient.js';

/** { email } or { mobile } from what the user typed. */
export const contactBody = (contact) =>
  contact.includes('@') ? { email: contact.trim() } : { mobile: contact.trim() };

export const authService = {
  register: ({ email, mobile, password }) =>
    apiClient.post('/auth/register', {
      ...(email && { email }),
      ...(mobile && { mobile }),
      password,
    }),

  sendOtp: (contact) => apiClient.post('/auth/send-otp', contactBody(contact)),

  verifyOtp: (contact, otp) => apiClient.post('/auth/verify-otp', { ...contactBody(contact), otp }),

  login: (identifier, password) => apiClient.post('/auth/login', { identifier, password }),

  adminLogin: (identifier, password) => apiClient.post('/admin/login', { identifier, password }),

  sendLoginOtp: (identifier) => apiClient.post('/auth/login/send-otp', { identifier }),

  verifyLoginOtp: (identifier, otp) => apiClient.post('/auth/login/verify-otp', { identifier, otp }),

  /** Sends ONLY the detection result — never the captured image. */
  completeLoginVerification: (verificationToken, detection) =>
    apiClient.post('/auth/login-verification/complete', {
      verification_token: verificationToken,
      face_detected: detection.faceCount > 0,
      face_count: detection.faceCount,
      ...(detection.confidence !== undefined && { confidence: detection.confidence }),
      detector: detection.detector,
    }),

  me: () => apiClient.get('/auth/me', { auth: true }),

  logout: () => apiClient.post('/auth/logout', undefined, { auth: true }),
};
