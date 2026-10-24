/**
 * Blocking and reporting (Phase 13). The blocker/reporter is always the
 * signed-in user — the server takes it from the access token.
 */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const BLOCK_REASONS = Object.freeze([
  { value: 'harassment', label: 'Harassment or abusive behaviour' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake_profile', label: 'Fake or misleading profile' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'threatening', label: 'Threatening behaviour' },
  { value: 'other', label: 'Other' },
]);

export const safetyService = {
  listBlocks: () => apiClient.get('/blocks', AUTH),
  blockUser: (blockedUserId, reason) => apiClient.post('/blocks', { blockedUserId, reason }, AUTH),
  unblockUser: (userId) => apiClient.delete(`/blocks/${userId}`, AUTH),

  getReportReasons: () => apiClient.get('/reports/reasons', AUTH),
  reportUser: ({ reportedUserId, reason, description }) =>
    apiClient.post('/reports', { reportedUserId, reason, ...(description ? { description } : {}) }, AUTH),
  listOwnReports: () => apiClient.get('/reports', AUTH),
};
