/**
 * Profile API calls for the signed-in user. The backend identifies the user
 * from the access token — no user id is ever sent.
 */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const profileService = {
  get: () => apiClient.get('/profile', AUTH),
  create: (fields) => apiClient.post('/profile', fields, AUTH),
  update: (fields) => apiClient.put('/profile', fields, AUTH),

  /** Profile picture (gallery, file or camera). No face detection is involved. */
  uploadPhoto: (file) => {
    const form = new FormData();
    form.append('photo', file, file.name || 'photo.jpg');
    return apiClient.put('/profile/photo', form, AUTH);
  },

  removePhoto: () => apiClient.delete('/profile/photo', AUTH),
};
