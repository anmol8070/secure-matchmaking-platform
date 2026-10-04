/**
 * Test helpers: render the whole app at a URL with a fake backend.
 *
 *   const api = mockApi({ 'POST /auth/login': { status: 200, body: {...} } });
 *   renderApp('/login');
 *   api.calls  → [{ method, path, body, headers }]
 */
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext.jsx';
import AppRoutes from '../routes/AppRoutes.jsx';

export function mockApi(routes = {}) {
  const calls = [];
  const handlers = {
    'GET /health': { status: 200, body: { success: true, message: 'API is running', version: 'v1' } },
    ...routes,
  };

  global.fetch = vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/, '');
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path, body, headers: options.headers || {} });

    let handler = handlers[`${method} ${path}`];
    if (typeof handler === 'function') handler = handler({ body, headers: options.headers || {} });
    if (Array.isArray(handler)) handler = handler.length > 1 ? handler.shift() : handler[0];
    const { status = 404, body: responseBody = { success: false, message: 'API endpoint not found' } } =
      handler || {};
    return { ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => responseBody };
  });

  return { calls, callsTo: (method, path) => calls.filter((c) => c.method === method && c.path === path) };
}

export function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </output>
  );
}

export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>
  );
}

/** A JWT-shaped token whose exp is in the future (signature is not checked client-side). */
export function fakeAccessToken({ expiresInSeconds = 3600 } = {}) {
  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ user_id: 1, role: 'user', exp })}.signature`;
}

export const USER = {
  user_id: 7,
  email: 'asha@example.com',
  mobile: null,
  role: 'user',
  status: 'active',
};

export const ADMIN = { ...USER, user_id: 1, email: 'admin@example.com', role: 'admin' };

export const CHALLENGE = {
  status: 200,
  body: {
    success: true,
    message: 'Credentials verified. Live verification required.',
    data: { requires_live_verification: true, verification_token: 'v'.repeat(43), verification_expires_in: 300 },
  },
};
