/**
 * Phase 15: navigation, mobile menu, 404 handling, deep links and the dashboard.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN, USER, fakeAccessToken, mockApi, renderApp } from '../test/renderApp.jsx';

const ok = (data) => ({ status: 200, body: { success: true, message: 'Request successful', data } });

function signedIn(user = USER, routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(user), ...routes });
}

afterEach(() => vi.restoreAllMocks());

describe('member navigation', () => {
  it('lists every member section and marks the current page', async () => {
    signedIn();
    renderApp('/connections/requests');
    await screen.findByRole('link', { name: 'Dashboard' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const name of ['Dashboard', 'Discover', 'Connections', 'Requests', 'Messages', 'Calls', 'Profile', 'Preferences', 'Privacy']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Requests' })).toHaveAttribute('aria-current', 'page');
    // The parent section is not highlighted on its sub-page.
    expect(within(nav).getByRole('link', { name: 'Connections' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('guests see the landing sections and the account links', async () => {
    mockApi();
    renderApp('/login');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Explore', 'How it works', 'Features', 'Safety', 'FAQ', 'Log in', 'Sign up']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/#explore', '/#how-it-works', '/#features', '/#safety', '/#faq', '/login', '/register']);
    expect(within(nav).getByRole('link', { name: 'Log in' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('a signed-in member on the landing page is offered the dashboard, not log in', async () => {
    signedIn();
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see your matches/i })).toHaveAttribute('href', '/matches');
  });

  it('the mobile menu button opens and closes the menu, also on Escape and after navigating', async () => {
    signedIn();
    renderApp('/calls');
    await screen.findByRole('link', { name: 'Dashboard' });
    const toggle = screen.getByRole('button', { name: 'Menu' });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', nav.id);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(nav).toHaveClass('nav--open');
    expect(toggle).toHaveTextContent('Close');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    fireEvent.click(within(nav).getByRole('link', { name: 'Privacy' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/privacy'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('has a skip link to the main content', async () => {
    mockApi();
    renderApp('/login');
    const skip = await screen.findByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content').tagName).toBe('MAIN');
  });
});

describe('unknown pages', () => {
  it('a guest gets the 404 page inside the site layout with a link home', async () => {
    mockApi();
    renderApp('/no-such-page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('a member is offered the dashboard', async () => {
    signedIn();
    renderApp('/matches/old/link');
    expect(await screen.findByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute('href', '/dashboard');
  });

  it('an unknown admin URL stays inside the admin layout', async () => {
    signedIn(ADMIN);
    renderApp('/admin/no-such-page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the admin dashboard' })).toHaveAttribute('href', '/admin/dashboard');
  });
});

describe('route protection and deep links', () => {
  it('remembers the requested page (with its query) when sending a visitor to login', async () => {
    mockApi();
    renderApp('/video?with=9');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
    expect(JSON.parse(screen.getByTestId('location').dataset.state)).toEqual({ from: '/video?with=9' });
  });

  it('a signed-in member opening an admin page goes to the member dashboard', async () => {
    const api = signedIn();
    renderApp('/admin/users');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/dashboard'));
    expect(api.calls.some((c) => c.path.startsWith('/admin/'))).toBe(false);
  });

  it('a visitor opening an admin page goes to the admin login', async () => {
    mockApi();
    renderApp('/admin/reports');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/login'));
  });

  it('a 401 on any request ends the session and returns to login', async () => {
    signedIn(USER, { 'GET /privacy/settings': { status: 401, body: { success: false, message: 'Invalid or expired token' } } });
    renderApp('/privacy');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
    expect(sessionStorage.getItem('mm.accessToken')).toBeNull();
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
  });

  it('a 403 shows an error but keeps the member signed in', async () => {
    signedIn(USER, { 'GET /matches': { status: 403, body: { success: false, message: 'Not allowed' } } });
    renderApp('/matches');
    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/matches');
    expect(sessionStorage.getItem('mm.accessToken')).not.toBeNull();
  });
});

describe('dashboard', () => {
  it('links to every member feature and shows real pending counts', async () => {
    signedIn(USER, {
      'GET /profile': { status: 404, body: { success: false, message: 'Profile not found' } },
      'GET /connections/requests/received': ok({ requests: [{ id: 1 }, { id: 2 }] }),
      'GET /messages/conversations': ok({ conversations: [{ unreadCount: 3 }, { unreadCount: 0 }] }),
    });
    renderApp('/dashboard');
    expect(await screen.findByText('2 requests are waiting for your answer.')).toBeInTheDocument();
    expect(await screen.findByText('3 unread messages.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /complete profile/i })).toHaveAttribute('href', '/profile/create');
    const features = screen.getByRole('navigation', { name: 'Member features' });
    for (const href of ['/matches', '/connections/requests', '/messages', '/connections', '/calls', '/preferences', '/privacy']) {
      expect(within(features).getAllByRole('link').some((a) => a.getAttribute('href') === href)).toBe(true);
    }
    // No stale "coming soon" placeholders for features that exist.
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('still renders when the counts cannot be loaded', async () => {
    signedIn(USER, { 'GET /profile': { status: 404, body: { success: false, message: 'x' } } });
    renderApp('/dashboard');
    expect(await screen.findByText('Requests you have received and sent.')).toBeInTheDocument();
    expect(screen.getByText('Private chats with your connections.')).toBeInTheDocument();
  });
});
