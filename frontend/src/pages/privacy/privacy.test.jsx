import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../test/renderApp.jsx';

const ok = (data, message = 'Request successful') => ({ status: 200, body: { success: true, message, data } });
const fail = (status, message) => ({ status, body: { success: false, message } });

const DEFAULTS = {
  profileVisibility: 'everyone',
  photoVisibility: 'everyone',
  ageVisibility: 'everyone',
  locationVisibility: 'everyone',
  educationVisibility: 'everyone',
  occupationVisibility: 'everyone',
  lifestyleVisibility: 'everyone',
  bioVisibility: 'everyone',
  hobbiesVisibility: 'everyone',
  onlineStatusVisibility: 'connections',
};
const OPTIONS = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, k === 'profileVisibility' ? ['everyone', 'connections'] : ['everyone', 'connections', 'nobody']]));
const REASONS = ok({
  reasons: [
    { value: 'harassment', label: 'Harassment or abusive behaviour' },
    { value: 'spam', label: 'Spam' },
    { value: 'other', label: 'Other' },
  ],
});
const RIYA = { userId: 4, name: 'Riya Shah', profilePicture: null, age: null, location: null };

function signedIn(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(USER), ...routes });
}

afterEach(() => vi.restoreAllMocks());

/* ---------------- privacy settings ---------------- */

describe('privacy settings page', () => {
  it('requires sign-in', async () => {
    mockApi();
    renderApp('/privacy');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
  });

  it('shows the current settings and saves only what changed', async () => {
    const api = signedIn({
      'GET /privacy/settings': ok({ settings: DEFAULTS, options: OPTIONS }),
      'PUT /privacy/settings': ({ body }) => ok({ settings: { ...DEFAULTS, ...body } }, 'Privacy settings saved.'),
    });
    renderApp('/privacy');

    const location = await screen.findByLabelText('Location');
    expect(location).toHaveValue('everyone');
    expect(screen.getByLabelText('Online status')).toHaveValue('connections');
    expect(within(screen.getByLabelText('Profile')).queryByRole('option', { name: 'Only me' })).not.toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(location, { target: { value: 'nobody' } });
    fireEvent.change(screen.getByLabelText('Hobbies'), { target: { value: 'connections' } });
    fireEvent.click(save);

    expect(await screen.findByText('Privacy settings saved.')).toBeInTheDocument();
    expect(api.callsTo('PUT', '/privacy/settings')[0].body).toEqual({ locationVisibility: 'nobody', hobbiesVisibility: 'connections' });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows the server error when saving fails', async () => {
    signedIn({
      'GET /privacy/settings': ok({ settings: DEFAULTS, options: OPTIONS }),
      'PUT /privacy/settings': fail(422, 'Validation failed'),
    });
    renderApp('/privacy');
    fireEvent.change(await screen.findByLabelText('Age'), { target: { value: 'nobody' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
  });
});

/* ---------------- blocked users ---------------- */

describe('blocked users page', () => {
  it('lists blocked users and unblocks after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = signedIn({
      'GET /blocks': ok({ blocks: [{ userId: 4, user: RIYA, blockedAt: '2026-10-23T10:00:00.000Z' }] }),
      'DELETE /blocks/4': ok({ block: { userId: 4, blocked: false } }),
    });
    renderApp('/privacy/blocked');

    const card = (await screen.findByText('Riya Shah')).closest('li');
    fireEvent.click(within(card).getByRole('button', { name: 'Unblock' }));
    expect(await screen.findByText('Riya Shah has been unblocked.')).toBeInTheDocument();
    expect(screen.getByText('You have not blocked anyone.')).toBeInTheDocument();
    expect(api.callsTo('DELETE', '/blocks/4')).toHaveLength(1);
  });

  it('does nothing when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const api = signedIn({ 'GET /blocks': ok({ blocks: [{ userId: 4, user: RIYA, blockedAt: '2026-10-23T10:00:00.000Z' }] }) });
    renderApp('/privacy/blocked');
    fireEvent.click(await screen.findByRole('button', { name: 'Unblock' }));
    expect(api.callsTo('DELETE', '/blocks/4')).toHaveLength(0);
    expect(screen.getByText('Riya Shah')).toBeInTheDocument();
  });

  it('shows empty and error states', async () => {
    signedIn({ 'GET /blocks': ok({ blocks: [] }) });
    const { unmount } = renderApp('/privacy/blocked');
    expect(await screen.findByText('You have not blocked anyone.')).toBeInTheDocument();
    unmount();

    signedIn({ 'GET /blocks': fail(500, 'Something went wrong') });
    renderApp('/privacy/blocked');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

/* ---------------- reporting & blocking from a connection card ---------------- */

describe('report and block actions', () => {
  const connectionsApi = (routes = {}) =>
    signedIn({
      'GET /connections': ok({ connections: [{ connectionId: 3, user: { ...RIYA, age: 29, location: 'Pune' }, connectedAt: '2026-10-03T00:00:00.000Z' }] }),
      'GET /reports/reasons': REASONS,
      ...routes,
    });

  it('requires a reason, sends one report even on double submit, and confirms without moderation details', async () => {
    const api = connectionsApi({
      'POST /reports': { status: 201, body: { success: true, message: 'Thank you. Your report has been received and will be reviewed by our team.', data: { report: { id: 9 } } } },
    });
    renderApp('/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Report' }));
    const dialog = await screen.findByRole('dialog', { name: 'Report Riya Shah' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit report' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a reason');
    expect(api.callsTo('POST', '/reports')).toHaveLength(0);

    await within(dialog).findByRole('option', { name: 'Spam' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'harassment' } });
    fireEvent.change(within(dialog).getByLabelText('Details (optional)'), { target: { value: '  Rude messages  ' } });
    const form = within(dialog).getByLabelText('Reason').closest('form');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(await within(dialog).findByText(/has been received/)).toBeInTheDocument();
    expect(api.callsTo('POST', '/reports').map((c) => c.body)).toEqual([{ reportedUserId: 4, reason: 'harassment', description: 'Rude messages' }]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows report errors from the server', async () => {
    connectionsApi({ 'POST /reports': fail(429, 'You have sent many reports recently. Please try again later.') });
    renderApp('/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Report' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Spam' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'spam' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('many reports recently');
  });

  it('asks for a reason, then blocks and removes the connection from the list', async () => {
    const api = connectionsApi({ 'POST /blocks': { status: 201, body: { success: true, message: 'User blocked.', data: { block: { userId: 4 } } } } });
    renderApp('/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog', { name: 'Block Riya Shah' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a reason');
    expect(api.callsTo('POST', '/blocks')).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'spam' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));

    await waitFor(() => expect(screen.queryByText('Riya Shah, 29')).not.toBeInTheDocument());
    expect(api.callsTo('POST', '/blocks')[0].body).toEqual({ blockedUserId: 4, reason: 'spam' });
  });

  it('does not block when the dialog is cancelled', async () => {
    const api = connectionsApi();
    renderApp('/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog', { name: 'Block Riya Shah' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.callsTo('POST', '/blocks')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Riya Shah, 29')).toBeInTheDocument();
  });
});
