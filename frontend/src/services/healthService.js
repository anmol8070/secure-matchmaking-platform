import { apiClient } from './apiClient.js';

export function getHealth(options) {
  return apiClient.get('/health', options);
}
