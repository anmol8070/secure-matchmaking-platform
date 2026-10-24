/**
 * Thin HTTP client for the backend REST API.
 * All network calls go through services/ — components never call fetch directly.
 *
 * Requests made with { auth: true } carry the access token. A 401 on such a
 * request means the session is no longer valid; the registered handler
 * (AuthContext) moves the app to the "session expired" state. A 403 is not a
 * session problem (the action is not allowed: blocked user, not an admin…),
 * so it is only thrown for the page to show.
 *
 * { params } is turned into a query string.
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

/** "?a=1&b=x" from an object; empty, null and undefined values are left out. */
export function toQueryString(params = {}) {
  const search = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return search ? `?${search}` : '';
}

export async function request(path, { method = 'GET', body, headers, auth = false, params, ...rest } = {}) {
  const token = auth ? tokenStore.get() : null;
  // FormData (file uploads) is sent as multipart; the browser sets the boundary header.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}${params ? toQueryString(params) : ''}`, {
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

/**
 * Authenticated binary download (e.g. private chat images). <img src> cannot
 * send the Bearer token, so callers turn the Blob into an object URL.
 */
export async function fetchBlob(path) {
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiRequestError('Cannot reach the server. Check your connection and try again.', 0, null);
  }
  if (!response.ok) {
    if (response.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiRequestError(response.statusText || 'Request failed', response.status, null);
  }
  return response.blob();
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
