/**
 * Thin HTTP client for the backend REST API.
 * All network calls go through services/ — components never call fetch directly.
 */
import { API_BASE_URL } from '../utils/constants.js';

export class ApiRequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

export async function request(path, { method = 'GET', body, headers, ...rest } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...rest,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(data?.message || response.statusText, response.status, data);
  }
  return data;
}

export const apiClient = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};
