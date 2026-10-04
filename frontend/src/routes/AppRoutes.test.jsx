import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppRoutes from './AppRoutes.jsx';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );
}

describe('AppRoutes', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, message: 'API is running' }),
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['/', /find meaningful connections/i],
    ['/register', /create your account/i],
    ['/verify-otp', /verify otp/i],
    ['/login', /^log in$/i],
  ])('renders user page %s inside the user layout', (path, heading) => {
    const { container } = renderAt(path);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(container.querySelector('.layout--user')).not.toBeNull();
  });

  it.each([
    ['/admin/login', /admin login/i],
    ['/admin/dashboard', /admin dashboard/i],
    ['/admin', /admin dashboard/i],
  ])('renders admin page %s inside the admin layout', (path, heading) => {
    const { container } = renderAt(path);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(container.querySelector('.layout--admin')).not.toBeNull();
  });

  it('shows the API status from the health endpoint', async () => {
    renderAt('/');
    expect(await screen.findByText(/api online/i)).toBeInTheDocument();
  });

  it('renders the not-found page for unknown routes', () => {
    renderAt('/nope');
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});
