/**
 * Private chat REST API (Phase 11). History and the conversation list always
 * come from here — the database is the source of truth; the socket only
 * delivers new events faster.
 */
import { apiClient, toQueryString as query } from './apiClient.js';

const AUTH = { auth: true };

export const messageService = {
  getConversations: () => apiClient.get('/messages/conversations', AUTH),
  /** One history page, oldest → newest. Pass the previous nextCursor as `before`. */
  getMessages: (userId, { before, limit } = {}) => apiClient.get(`/messages/${userId}${query({ before, limit })}`, AUTH),
  sendMessage: (receiverId, message) => apiClient.post('/messages', { receiverId, message }, AUTH),
  /** Image (JPG/PNG/WEBP) with an optional caption — multipart, REST only. */
  sendImage: (receiverId, file, caption = '') => {
    const form = new FormData();
    form.append('receiverId', String(receiverId));
    if (caption) form.append('caption', caption);
    form.append('image', file);
    return apiClient.post('/messages/images', form, AUTH);
  },
  markMessageRead: (messageId) => apiClient.put(`/messages/${messageId}/read`, undefined, AUTH),
};
