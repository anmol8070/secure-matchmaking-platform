/** Privacy settings of the signed-in user (Phase 13). The server enforces them everywhere. */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const privacyService = {
  getSettings: () => apiClient.get('/privacy/settings', AUTH),
  /** Send only the settings that changed. */
  updateSettings: (changes) => apiClient.put('/privacy/settings', changes, AUTH),
};
