import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN, USER, fakeAccessToken, mockApi, renderApp } from '../../test/renderApp.jsx';

const ok = (data, message = 'Request successful') => ({ status: 200, body: { success: true, message, data } });
const fail = (status, message) => ({ status, body: { success: false, message } });

const DASHBOARD = {
  period: { from: '2026-09-25T00:00:00.000Z', to: '2026-10-24T12:00:00.000Z' },
  users: { total: 1284, active: 1200, suspended: 7, pendingVerification: 70, deactivated: 7, admins: 2, newInPeriod: 96 },
  reports: { total: 40, pending: 5, underReview: 2, resolved: 30, dismissed: 3, submittedInPeriod: 11 },
  connections: { active: 310, pendingRequests: 44, requestsInPeriod: 120 },
  messages: { total: 9876, inPeriod: 2345 },
  calls: { total: 77, inPeriod: 20, completed: 15, missed: 4, ongoing: 1 },
};
const HEALTH = { uptimeSeconds: 7260, database: { reachable: true, latencyMs: 3 }, realtime: { socketServer: true, connectedClients: 12, redisAdapter: false }, activeCalls: 1 };
const USERS = {
  users: [
    { userId: 21, name: 'Riya Shah', email: 'riya@example.com', mobile: '•••••••210', role: 'user', status: 'active', createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, openReports: 2 },
    { userId: 20, name: null, email: 'new@example.com', mobile: null, role: 'user', status: 'suspended', createdAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null, openReports: 0 },
  ],
  pagination: { page: 1, limit: 20, total: 45, totalPages: 3 },
};
const USER_DETAIL = (status = 'active') => ({
  user: { userId: 21, email: 'riya@example.com', mobile: '+919876543210', role: 'user', status, emailVerified: true, mobileVerified: false, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null },
  profile: { name: 'Riya Shah', gender: 'female', age: 29, location: 'Pune', education: null, occupation: null, lifestyle: null, bio: null, profilePicture: null, completion: { percentage: 60 } },
  stats: { connections: 3, pendingRequests: 1, reportsAgainst: { total: 2, open: 2 }, reportsFiled: 0, blockedByUsers: 1, messagesSent: 40, calls: 2 },
  history: [],
});
const REPORT = (status = 'pending', history = []) => ({
  id: 9,
  reporterId: 30,
  reporter: { userId: 30, name: 'Asha', email: 'asha@example.com', status: 'active', role: 'user' },
  reportedUserId: 21,
  reportedUser: { userId: 21, name: 'Riya Shah', email: 'riya@example.com', status: 'active', role: 'user' },
  reportedUserOpenReports: 2,
  reason: 'harassment',
  reasonLabel: 'Harassment or abusive behaviour',
  description: '<b>rude</b> messages',
  status,
  actionTaken: null,
  resolutionNote: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  history,
});

function asAdmin(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(ADMIN), ...routes });
}

afterEach(() => vi.restoreAllMocks());

/* ---------------- access ---------------- */

describe('admin access', () => {
  it('sends visitors to the admin login and ordinary users to their dashboard', async () => {
    mockApi();
    const { unmount } = renderApp('/admin/users');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/login'));
    unmount();

    sessionStorage.setItem('mm.accessToken', fakeAccessToken());
    mockApi({ 'GET /auth/me': ok(USER) });
    renderApp('/admin/reports');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/dashboard'));
  });
});

/* ---------------- dashboard ---------------- */

describe('admin dashboard', () => {
  it('shows the real counts from the API and refetches for another range', async () => {
    const api = asAdmin({ 'GET /admin/dashboard': ok(DASHBOARD), 'GET /admin/monitoring': ok(HEALTH) });
    renderApp('/admin/dashboard');

    const users = (await screen.findByText('Registered users')).closest('.admin-stat');
    expect(within(users).getByText('1,284')).toBeInTheDocument();
    expect(within(users).getByText('96 new in period')).toBeInTheDocument();
    expect(screen.getByText('Messages in period').closest('.admin-stat')).toHaveTextContent('2,345');
    expect(screen.getByText(/Reachable \(3 ms\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => expect(api.callsTo('GET', '/admin/dashboard')).toHaveLength(2));
  });

  it('shows an error state', async () => {
    asAdmin({ 'GET /admin/dashboard': fail(500, 'Something went wrong'), 'GET /admin/monitoring': ok(HEALTH) });
    renderApp('/admin/dashboard');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

/* ---------------- users ---------------- */

describe('user management', () => {
  it('lists users and searches / filters through the API', async () => {
    const api = asAdmin({ 'GET /admin/users': ok(USERS) });
    renderApp('/admin/users');

    const row = (await screen.findByRole('link', { name: 'Riya Shah' })).closest('tr');
    expect(within(row).getByText('•••••••210')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('(no profile)')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: '  riya  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'suspended' } });
    await waitFor(() => expect(api.calls.some((c) => c.path === '/admin/users' && c.method === 'GET')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/users'));
    expect(api.callsTo('GET', '/admin/users').length).toBeGreaterThanOrEqual(3);
  });

  it('shows the empty state', async () => {
    asAdmin({ 'GET /admin/users': ok({ users: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }) });
    renderApp('/admin/users');
    expect(await screen.findByText('No users match these filters.')).toBeInTheDocument();
  });

  it('requires a reason and confirmation to suspend, then shows the new status', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = asAdmin({
      'GET /admin/users/21': [ok(USER_DETAIL('active')), ok(USER_DETAIL('suspended'))],
      'PUT /admin/users/21/status': ok({ user: { userId: 21, status: 'suspended' } }, 'Account suspended.'),
    });
    renderApp('/admin/users/21');

    expect(await screen.findByRole('heading', { name: 'Riya Shah' })).toBeInTheDocument();
    expect(screen.getByText('Messages sent').closest('.details__row')).toHaveTextContent('40');
    expect(document.body.textContent).not.toMatch(/password|token/i);

    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give a reason');
    expect(api.callsTo('PUT', '/admin/users/21/status')).toHaveLength(0);

    fireEvent.change(screen.getByLabelText(/Reason for suspension/), { target: { value: 'Repeated harassment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }));
    expect(await screen.findByText('Account suspended.')).toBeInTheDocument();
    expect(api.callsTo('PUT', '/admin/users/21/status')[0].body).toEqual({ status: 'suspended', reason: 'Repeated harassment' });
    expect(await screen.findByRole('button', { name: 'Reactivate account' })).toBeInTheDocument();
  });

  it('links a suspension started from a report to that report', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = asAdmin({
      'GET /admin/users/21': ok(USER_DETAIL('active')),
      'PUT /admin/users/21/status': ok({ user: { userId: 21, status: 'suspended' } }, 'Account suspended.'),
    });
    renderApp('/admin/users/21?report=9');
    expect(await screen.findByRole('link', { name: 'report #9' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Reason for suspension/), { target: { value: 'Threats' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }));
    await waitFor(() => expect(api.callsTo('PUT', '/admin/users/21/status')[0].body).toEqual({ status: 'suspended', reason: 'Threats', reportId: 9 }));
  });

  it('does not offer suspension for admin accounts or yourself', async () => {
    asAdmin({ 'GET /admin/users/21': ok({ ...USER_DETAIL('active'), user: { ...USER_DETAIL().user, role: 'admin' } }) });
    renderApp('/admin/users/21');
    expect(await screen.findByText('Admin accounts cannot be suspended from the admin panel.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument();
  });

  it('shows not found', async () => {
    asAdmin({ 'GET /admin/users/999': fail(404, 'User not found.') });
    renderApp('/admin/users/999');
    expect(await screen.findByRole('alert')).toHaveTextContent('User not found.');
  });
});

/* ---------------- reports ---------------- */

describe('report moderation', () => {
  it('lists reports with filters from the URL', async () => {
    const api = asAdmin({ 'GET /admin/reports': ok({ reports: [REPORT()], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }) });
    renderApp('/admin/reports?status=pending');
    const row = (await screen.findByRole('link', { name: 'Harassment or abusive behaviour' })).closest('tr');
    expect(within(row).getByText('· 2 open')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
    expect(api.callsTo('GET', '/admin/reports')).toHaveLength(1);
  });

  it('reviews a report: shows the description as text, offers only valid decisions, records the note', async () => {
    const api = asAdmin({
      'GET /admin/reports/9': ok({ report: REPORT('pending') }),
      'PUT /admin/reports/9/status': ({ body }) =>
        ok({ report: { ...REPORT(body.status, [{ id: 1, adminId: 1, adminEmail: 'admin@example.com', action: 'report_status_changed', metadata: { from: 'pending', to: body.status }, reason: body.resolutionNote, createdAt: '2026-10-24T10:00:00.000Z' }]), resolutionNote: body.resolutionNote } }),
    });
    renderApp('/admin/reports/9');

    expect(await screen.findByText('<b>rude</b> messages')).toBeInTheDocument(); // plain text, not HTML
    expect(screen.getByRole('link', { name: 'the account page' })).toHaveAttribute('href', '/admin/users/21?report=9');
    expect(screen.getByRole('button', { name: 'Mark under review' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Warned the user.' } });
    fireEvent.change(screen.getByLabelText(/Action taken/), { target: { value: 'warning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));

    expect(await screen.findByText('Report marked as resolved.')).toBeInTheDocument();
    expect(api.callsTo('PUT', '/admin/reports/9/status')[0].body).toEqual({ status: 'resolved', resolutionNote: 'Warned the user.', actionTaken: 'warning' });
    expect(screen.getByText('This report is closed.')).toBeInTheDocument();
    expect(screen.getByText('Pending → Resolved')).toBeInTheDocument();
  });

  it('shows conflicts from the server (someone else decided first)', async () => {
    asAdmin({
      'GET /admin/reports/9': ok({ report: REPORT('pending') }),
      'PUT /admin/reports/9/status': fail(409, 'The report was updated by someone else. Reload and try again.'),
    });
    renderApp('/admin/reports/9');
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('updated by someone else');
  });
});

/* ---------------- activity & ML ---------------- */

describe('activity and ML monitoring', () => {
  const ACTIVITY = {
    period: {},
    days: ['2026-10-22', '2026-10-23', '2026-10-24'],
    series: { registrations: [1, 0, 4], connectionRequests: [2, 2, 0], acceptedConnections: [1, 0, 0], messages: [10, 30, 5], calls: [0, 1, 0], reportsSubmitted: [0, 0, 1], reportsClosed: [0, 0, 0] },
    totals: { registrations: 5, connectionRequests: 4, acceptedConnections: 1, messages: 45, calls: 1, reportsSubmitted: 1, reportsClosed: 0 },
  };
  const AUDIT = ok({
    entries: [{ id: 3, adminId: 1, adminEmail: 'admin@example.com', action: 'user_suspended', targetType: 'user', targetId: 21, reason: 'Spam', metadata: { from: 'active', to: 'suspended' }, createdAt: '2026-10-24T09:00:00.000Z' }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });

  it('draws one chart per series with focusable columns, and offers a table view', async () => {
    asAdmin({ 'GET /admin/activity': ok(ACTIVITY), 'GET /admin/audit-logs': AUDIT });
    renderApp('/admin/activity');

    const chart = (await screen.findByText('Messages')).closest('figure');
    expect(within(chart).getByRole('img', { name: /Messages: 45 in the selected period, peak 30/ })).toBeInTheDocument();
    fireEvent.focus(within(chart).getByLabelText('2026-10-23: 30'));
    expect(within(chart).getByRole('status')).toHaveTextContent('302026-10-23');

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table', { name: 'Daily activity' });
    expect(within(table).getAllByRole('row')).toHaveLength(5); // header + 3 days + total
    expect(within(screen.getAllByRole('table')[1]).getByText('User suspended')).toBeInTheDocument();
  });

  it('shows an honest status when no model is trained', async () => {
    asAdmin({
      'GET /admin/ml': ok({
        status: 'not_trained',
        message: 'ML model not yet trained. Recommendations use the deterministic compatibility ranking.',
        activeModel: null,
        models: [],
        interactions: { byAction: {}, positiveLabels: 0, negativeLabels: 0 },
        baseline: null,
        baselineNote: 'not recorded',
      }),
    });
    renderApp('/admin/ml-monitoring');
    expect(await screen.findByText(/ML model not yet trained/)).toBeInTheDocument();
    expect(screen.getByText('No models have been trained yet.')).toBeInTheDocument();
  });

  it('shows stored metrics and marks missing ones as not recorded', async () => {
    const model = { version: 'lr-v1', type: 'logistic_regression', featureVersion: 'v1', status: 'active', trainedAt: '2026-10-20T00:00:00.000Z', trainingSamples: 120, positiveSamples: 70, negativeSamples: 50, metrics: { precision: 0.71, recall: 0.6, f1Score: 0.65, rocAuc: 0.72, precisionAtK: null, acceptanceRate: null } };
    asAdmin({ 'GET /admin/ml': ok({ status: 'trained', message: null, activeModel: model, models: [model], interactions: { byAction: { interest: 50 }, positiveLabels: 50, negativeLabels: 5 }, baseline: null, baselineNote: 'A baseline is not recorded.' }) });
    renderApp('/admin/ml-monitoring');
    expect((await screen.findByText('ROC-AUC', { selector: '.admin-stat__label' })).closest('.admin-stat')).toHaveTextContent('0.720');
    expect(screen.getByText('Precision@K').closest('.admin-stat')).toHaveTextContent('Not recorded');
    expect(screen.getByText('A baseline is not recorded.')).toBeInTheDocument();
  });
});
