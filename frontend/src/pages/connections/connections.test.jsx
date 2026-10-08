import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../test/renderApp.jsx';
import ConnectionButton from '../../components/connections/ConnectionButton.jsx';

const ok = (data, message = 'Request successful') => ({ status: 200, body: { success: true, message, data } });
const fail = (status, message) => ({ status, body: { success: false, message } });

function signedIn(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(USER), ...routes });
}

const status = (state, extra = {}) =>
  ok({ userId: 9, state, connectionId: state === 'none' || state === 'unavailable' ? null : 55, canSendRequest: state === 'none', canCommunicate: state === 'connected', ...extra });

const person = (userId, name) => ({ userId, name, profilePicture: null, age: 29, location: 'Pune, Maharashtra, India' });

/* ---------------- connection button ---------------- */

describe('ConnectionButton', () => {
  it('sends a request, disables itself while sending and then shows "Request Pending"', async () => {
    const api = signedIn({
      'GET /connections/status/9': [status('none'), status('pending_outgoing')],
      'POST /connections': { status: 201, body: { success: true, data: { connection: { id: 55 } } } },
    });
    // Hold the POST response until release() so the in-flight state is observable.
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const fakeBackend = global.fetch;
    global.fetch = vi.fn(async (url, options = {}) => {
      if (options.method === 'POST') await gate;
      return fakeBackend(url, options);
    });

    render(<ConnectionButton userId={9} />);
    const button = await screen.findByRole('button', { name: 'Send Connection Request' });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
    release();

    expect(await screen.findByRole('button', { name: 'Request Pending' })).toBeDisabled();
    expect(screen.getByText('Connection request sent.')).toBeInTheDocument();
    expect(api.callsTo('POST', '/connections').map((c) => c.body)).toEqual([{ receiverId: 9 }]);
  });

  it('shows the backend message and the real state when the request is refused', async () => {
    signedIn({
      'GET /connections/status/9': [status('none'), status('pending_outgoing')],
      'POST /connections': fail(409, 'Connection request already pending.'),
    });
    render(<ConnectionButton userId={9} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send Connection Request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Connection request already pending.');
    expect(await screen.findByRole('button', { name: 'Request Pending' })).toBeInTheDocument();
  });

  it.each([
    ['connected', 'Connected'],
    ['rejected', 'Request Declined'],
    ['unavailable', 'Unavailable'],
    ['pending_outgoing', 'Request Pending'],
  ])('renders %s as a disabled "%s" button', async (state, label) => {
    signedIn({ 'GET /connections/status/9': status(state) });
    render(<ConnectionButton userId={9} />);
    expect(await screen.findByRole('button', { name: label })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Send Connection Request' })).not.toBeInTheDocument();
  });

  it('lets the recipient accept or reject an incoming request', async () => {
    const api = signedIn({
      'GET /connections/status/9': [status('pending_incoming'), status('connected')],
      'PUT /connections/55': ok({ connection: { id: 55, status: 'accepted' } }),
    });
    render(<ConnectionButton userId={9} />);
    expect(await screen.findByRole('button', { name: 'Reject' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept Request' }));

    expect(await screen.findByRole('button', { name: 'Connected' })).toBeInTheDocument();
    expect(api.callsTo('PUT', '/connections/55')[0].body).toEqual({ action: 'accept' });
  });

  it('shows an error when the status cannot be loaded', async () => {
    signedIn({ 'GET /connections/status/9': fail(500, 'Something went wrong') });
    render(<ConnectionButton userId={9} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load connection status.');
  });
});

/* ---------------- requests page ---------------- */

describe('connection requests page', () => {
  it('requires sign-in', async () => {
    mockApi();
    renderApp('/connections/requests');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
  });

  it('accepts and rejects received requests and reloads the list', async () => {
    const api = signedIn({
      'GET /connections/requests/received': [
        ok({ requests: [
          { id: 1, sender: person(4, 'Riya Shah'), status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
          { id: 2, sender: person(5, 'Kabir Rao'), status: 'pending', createdAt: '2026-10-02T00:00:00.000Z' },
        ] }),
        ok({ requests: [{ id: 2, sender: person(5, 'Kabir Rao'), status: 'pending', createdAt: '2026-10-02T00:00:00.000Z' }] }),
        ok({ requests: [] }),
      ],
      'PUT /connections/1': ok({ connection: { id: 1, status: 'accepted' } }),
      'PUT /connections/2': ok({ connection: { id: 2, status: 'rejected' } }),
    });
    renderApp('/connections/requests');

    const riya = (await screen.findByText('Riya Shah, 29')).closest('li');
    expect(within(riya).getByText('Pune, Maharashtra, India')).toBeInTheDocument();
    fireEvent.click(within(riya).getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Connection request accepted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Riya Shah, 29')).not.toBeInTheDocument());

    fireEvent.click(within(screen.getByText('Kabir Rao, 29').closest('li')).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('No connection requests yet.')).toBeInTheDocument();
    expect(screen.getByText('Connection request rejected.')).toBeInTheDocument();

    expect(api.callsTo('PUT', '/connections/1')[0].body).toEqual({ action: 'accept' });
    expect(api.callsTo('PUT', '/connections/2')[0].body).toEqual({ action: 'reject' });
  });

  it('shows sent requests with status and cancels pending ones', async () => {
    const api = signedIn({
      'GET /connections/requests/received': ok({ requests: [] }),
      'GET /connections/requests/sent': [
        ok({ requests: [
          { id: 7, receiver: person(8, 'Meera Iyer'), status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' },
          { id: 9, receiver: person(10, 'Arjun Das'), status: 'rejected', createdAt: '2026-09-01T00:00:00.000Z' },
        ] }),
        ok({ requests: [{ id: 9, receiver: person(10, 'Arjun Das'), status: 'rejected', createdAt: '2026-09-01T00:00:00.000Z' }] }),
      ],
      'PUT /connections/7': ok({ connection: { id: 7, status: 'cancelled' } }),
    });
    renderApp('/connections/requests');
    fireEvent.click(await screen.findByRole('tab', { name: 'Sent' }));

    const meera = (await screen.findByText('Meera Iyer, 29')).closest('li');
    expect(within(meera).getByText('Pending')).toBeInTheDocument();
    const arjun = screen.getByText('Arjun Das, 29').closest('li');
    expect(within(arjun).getByText('Declined')).toBeInTheDocument();
    expect(within(arjun).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    fireEvent.click(within(meera).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Connection request cancelled.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Meera Iyer, 29')).not.toBeInTheDocument());
    expect(api.callsTo('PUT', '/connections/7')[0].body).toEqual({ action: 'cancel' });
  });

  it('shows the backend error when an action fails', async () => {
    signedIn({
      'GET /connections/requests/received': ok({ requests: [{ id: 1, sender: person(4, 'Riya Shah'), status: 'pending', createdAt: '2026-10-01T00:00:00.000Z' }] }),
      'PUT /connections/1': fail(409, 'This connection request is no longer pending.'),
    });
    renderApp('/connections/requests');
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This connection request is no longer pending.');
  });

  it('shows an error when the list cannot be loaded', async () => {
    signedIn({ 'GET /connections/requests/received': fail(500, 'Something went wrong') });
    renderApp('/connections/requests');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

/* ---------------- connections page ---------------- */

describe('connections page', () => {
  it('lists accepted connections with profile and chat links', async () => {
    signedIn({
      'GET /connections': ok({ connections: [{ connectionId: 3, user: person(4, 'Riya Shah'), connectedAt: '2026-10-03T00:00:00.000Z' }] }),
    });
    renderApp('/connections');

    const card = (await screen.findByText('Riya Shah, 29')).closest('li');
    expect(within(card).getByRole('link', { name: 'View Profile' })).toHaveAttribute('href', '/matches?view=4');
    expect(within(card).getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/messages?with=4');
    expect(within(card).getByText(/Connected/)).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    signedIn({ 'GET /connections': ok({ connections: [] }) });
    renderApp('/connections');
    expect(await screen.findByText(/You have no active connections/)).toBeInTheDocument();
  });

  it('removes a connection after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = signedIn({
      'GET /connections': [
        ok({ connections: [{ connectionId: 3, user: person(4, 'Riya Shah'), connectedAt: '2026-10-03T00:00:00.000Z' }] }),
        ok({ connections: [] }),
      ],
      'DELETE /connections/3': ok({ connection: { id: 3, status: 'disconnected' } }),
    });
    renderApp('/connections');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(await screen.findByText('Connection removed.')).toBeInTheDocument();
    expect(await screen.findByText(/You have no active connections/)).toBeInTheDocument();
    expect(api.callsTo('DELETE', '/connections/3')).toHaveLength(1);
    window.confirm.mockRestore();
  });

  it('shows an error state', async () => {
    signedIn({ 'GET /connections': fail(503, 'Service temporarily unavailable, please try again later') });
    renderApp('/connections');
    expect(await screen.findByRole('alert')).toHaveTextContent('Service temporarily unavailable');
  });
});
