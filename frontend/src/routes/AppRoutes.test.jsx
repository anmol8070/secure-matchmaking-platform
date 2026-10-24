import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ADMIN, USER, fakeAccessToken, mockApi, renderApp } from '../test/renderApp.jsx';

const location = () => screen.getByTestId('location').textContent;

function signedInAs(user) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': { status: 200, body: { success: true, data: user } } });
}

describe('public routes', () => {
  it.each([
    ['/', /some connections change everything/i],
    ['/register', /create your account/i],
    ['/otp-verification', /verify your account/i],
    ['/login', /^log in$/i],
    ['/admin/login', /admin login/i],
  ])('renders %s for visitors', async (path, heading) => {
    mockApi();
    renderApp(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('shows the API status from the health endpoint', async () => {
    mockApi();
    renderApp('/');
    expect(await screen.findByText(/api online/i)).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', () => {
    mockApi();
    renderApp('/nope');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});

describe('protected routes', () => {
  it.each(['/dashboard', '/profile', '/preferences', '/matches', '/connections', '/messages'])(
    'redirects visitors from %s to /login',
    async (path) => {
      mockApi();
      renderApp(path);
      await waitFor(() => expect(location()).toBe('/login'));
    }
  );

  it('does not open live verification without verified credentials', async () => {
    mockApi();
    renderApp('/login-verification');
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('restores a stored session and shows the dashboard', async () => {
    const api = signedInAs(USER);
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(USER.email))).toBeInTheDocument();
    expect(api.callsTo('GET', '/auth/me')[0].headers.Authorization).toMatch(/^Bearer /);
  });

  it('renders protected placeholders for signed-in users', async () => {
    signedInAs(USER);
    renderApp('/matches');
    expect(await screen.findByRole('heading', { name: /matches/i })).toBeInTheDocument();
  });

  it('sends signed-in users away from the login page', async () => {
    signedInAs(USER);
    renderApp('/login');
    await waitFor(() => expect(location()).toBe('/dashboard'));
  });

  it('keeps the session through a temporary /auth/me failure (rate limit, network)', async () => {
    sessionStorage.setItem('mm.accessToken', fakeAccessToken());
    const api = mockApi({
      'GET /auth/me': [
        { status: 429, body: { success: false, message: 'Too many requests.' } },
        { status: 200, body: { success: true, data: USER } },
      ],
    });
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: /welcome/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(api.callsTo('GET', '/auth/me')).toHaveLength(2);
    expect(sessionStorage.getItem('mm.accessToken')).not.toBeNull();
  });

  it('treats a rejected stored token as an expired session', async () => {
    sessionStorage.setItem('mm.accessToken', fakeAccessToken());
    mockApi({ 'GET /auth/me': { status: 401, body: { success: false, message: 'Session has expired or been revoked.' } } });
    renderApp('/dashboard');

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByText('Your session has expired. Please log in again.')).toBeInTheDocument();
    expect(sessionStorage.getItem('mm.accessToken')).toBeNull();
  });

  it('treats a locally expired token as an expired session without calling the API', async () => {
    sessionStorage.setItem('mm.accessToken', fakeAccessToken({ expiresInSeconds: -10 }));
    const api = mockApi();
    renderApp('/dashboard');

    await waitFor(() => expect(location()).toBe('/login'));
    expect(api.callsTo('GET', '/auth/me')).toHaveLength(0);
  });
});

describe('admin routes', () => {
  it('redirects visitors to the admin login', async () => {
    mockApi();
    renderApp('/admin/dashboard');
    await waitFor(() => expect(location()).toBe('/admin/login'));
  });

  it('keeps regular users out of the admin dashboard', async () => {
    signedInAs(USER);
    renderApp('/admin/dashboard');
    await waitFor(() => expect(location()).toBe('/dashboard'));
  });

  it('shows the admin dashboard to admins', async () => {
    signedInAs(ADMIN);
    renderApp('/admin');
    // The real dashboard (Phase 14); its data has its own tests in pages/admin/admin.test.jsx.
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
  });
});
