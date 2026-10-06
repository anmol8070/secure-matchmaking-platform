/**
 * Thin HTTP client for the backend REST API.
 * All network calls go through services/ — components never call fetch directly.
 *
 * Requests made with { auth: true } carry the access token. A 401 on such a
 * request means the session is no longer valid; the registered handler
 * (AuthContext) moves the app to the "session expired" state.
 */
import { API_BASE_URL } from '../utils/constants.js';
import { tokenStore } from './tokenStore.js';

export class ApiRequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

let unauthorizedHandler = null;

/** Registers the callback run when an authenticated request gets 401. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export async function request(path, { method = 'GET', body, headers, auth = false, ...rest } = {}) {
  const token = auth ? tokenStore.get() : null;
  // FormData (file uploads) is sent as multipart; the browser sets the boundary header.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      ...rest,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiRequestError('Cannot reach the server. Check your connection and try again.', 0, null);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (auth && response.status === 401 && unauthorizedHandler) unauthorizedHandler();
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

/** Field errors from a 422 response as { email: 'message', ... }. */
export function fieldErrors(error) {
  const errors = error?.body?.errors || [];
  return Object.fromEntries(errors.map((e) => [e.field.replace(/^body\./, ''), e.message]));
}
