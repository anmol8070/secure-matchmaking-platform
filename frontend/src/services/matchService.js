/**
 * Match recommendation and compatibility API service for the signed-in user.
 */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const matchService = {
  getRecommendations: (params = {}) => apiClient.get('/matches', { ...AUTH, params }),
  getMatchDetails: (userId) => apiClient.get(`/matches/${userId}`, AUTH),
  sendConnectionRequest: (receiverId) => apiClient.post('/connections/requests', { receiverId }, AUTH),
  recordFeedback: (data) => apiClient.post('/feedback', data, AUTH),
};
