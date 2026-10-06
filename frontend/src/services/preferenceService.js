/**
 * Preference, hobby and quiz API calls for the signed-in user. The backend
 * identifies the user from the access token — no user id is ever sent.
 */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const preferenceService = {
  get: () => apiClient.get('/preferences', AUTH),
  /** First save (POST) or later saves (PUT); hobbyIds and quizAnswers are saved in the same transaction. */
  save: (body, { exists }) => (exists ? apiClient.put('/preferences', body, AUTH) : apiClient.post('/preferences', body, AUTH)),
  options: () => apiClient.get('/preferences/options', AUTH),

  setHobbies: (hobbyIds) => apiClient.put('/preferences/hobbies', { hobbyIds }, AUTH),
  removeHobby: (hobbyId) => apiClient.delete(`/preferences/hobbies/${hobbyId}`, AUTH),

  getQuiz: () => apiClient.get('/preferences/quiz', AUTH),
  saveQuiz: (answers) => apiClient.put('/preferences/quiz', { answers }, AUTH),
};

export const hobbyService = {
  /** Active hobbies from the database. */
  list: () => apiClient.get('/hobbies', AUTH),
};
