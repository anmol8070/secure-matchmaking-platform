/**
 * Connection requests and connections API (Phase 10) for the signed-in user.
 * The sender is always the signed-in user — the backend takes it from the token.
 */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const connectionService = {
  sendConnectionRequest: (receiverId) => apiClient.post('/connections', { receiverId }, AUTH),
  getReceivedRequests: () => apiClient.get('/connections/requests/received', AUTH),
  getSentRequests: () => apiClient.get('/connections/requests/sent', AUTH),
  getConnections: () => apiClient.get('/connections', AUTH),
  getConnectionDetails: (id) => apiClient.get(`/connections/${id}`, AUTH),
  getConnectionStatus: (userId) => apiClient.get(`/connections/status/${userId}`, AUTH),
  /** action: 'accept' | 'reject' | 'cancel' */
  updateConnectionRequest: (id, action) => apiClient.put(`/connections/${id}`, { action }, AUTH),
  removeConnection: (id) => apiClient.delete(`/connections/${id}`, AUTH),
};
