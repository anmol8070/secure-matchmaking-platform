import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHALLENGE, USER, fakeAccessToken, mockApi, renderApp } from '../../test/renderApp.jsx';

const location = () => screen.getByTestId('location').textContent;
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('registration page', () => {
  it('registers and moves to OTP verification', async () => {
    const api = mockApi({
      'POST /auth/register': {
        status: 201,
        body: { success: true, data: { user_id: 7, otp_required: true, otp_channel: 'email', otp_destination: 'as**@example.com' } },
      },
    });
    renderApp('/register');

    type('Email', 'asha@example.com');
    type('Password', 'Secure123');
    type('Confirm password', 'Secure123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(location()).toBe('/otp-verification'));
    expect(api.callsTo('POST', '/auth/register')[0].body).toEqual({ email: 'asha@example.com', password: 'Secure123' });
    expect(await screen.findByText('We sent a code to as**@example.com.')).toBeInTheDocument();
  });

  it('checks matching passwords before calling the API', () => {
    const api = mockApi();
    renderApp('/register');
    type('Email', 'asha@example.com');
    type('Password', 'Secure123');
    type('Confirm password', 'Different1');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/register')).toHaveLength(0);
  });

  it('shows server field errors (duplicate email)', async () => {
    mockApi({
      'POST /auth/register': {
        status: 409,
        body: {
          success: false,
          message: 'An account with these details already exists',
          errors: [{ field: 'body.email', message: 'This email is already registered' }],
        },
      },
    });
    renderApp('/register');
    type('Email', 'asha@example.com');
    type('Password', 'Secure123');
    type('Confirm password', 'Secure123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('This email is already registered')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('An account with these details already exists');
  });
});

describe('OTP verification page', () => {
  it('verifies the account and sends the user to login', async () => {
    const api = mockApi({ 'POST /auth/verify-otp': { status: 200, body: { success: true, data: { status: 'active' } } } });
    renderApp('/otp-verification');
    type('Email or mobile number', 'asha@example.com');
    type('One-time password', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(location()).toBe('/login'));
    expect(api.callsTo('POST', '/auth/verify-otp')[0].body).toEqual({ email: 'asha@example.com', otp: '123456' });
    expect(await screen.findByText('Your account is verified. Please log in.')).toBeInTheDocument();
  });

  it('shows the generic invalid OTP message', async () => {
    mockApi({ 'POST /auth/verify-otp': { status: 401, body: { success: false, message: 'Invalid or expired OTP' } } });
    renderApp('/otp-verification');
    type('Email or mobile number', '9876543210');
    type('One-time password', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired OTP');
  });
});

describe('login page', () => {
  it('verifies the password, then goes to live verification (no access token yet)', async () => {
    const api = mockApi({ 'POST /auth/login': CHALLENGE });
    renderApp('/login');
    type('Email or mobile number', 'asha@example.com');
    type('Password', 'Secure123');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(location()).toBe('/login-verification'));
    expect(api.callsTo('POST', '/auth/login')[0].body).toEqual({ identifier: 'asha@example.com', password: 'Secure123' });
    expect(sessionStorage.getItem('mm.accessToken')).toBeNull();
  });

  it('shows invalid credentials and stays on the page', async () => {
    mockApi({ 'POST /auth/login': { status: 401, body: { success: false, message: 'Invalid credentials' } } });
    renderApp('/login');
    type('Email or mobile number', 'asha@example.com');
    type('Password', 'Wrong1234');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    expect(location()).toBe('/login');
  });

  it('supports login with an OTP, which also leads to live verification', async () => {
    const api = mockApi({
      'POST /auth/login/send-otp': { status: 200, body: { success: true, message: 'If the account exists, an OTP has been sent.' } },
      'POST /auth/login/verify-otp': CHALLENGE,
    });
    renderApp('/login');
    fireEvent.click(screen.getByRole('tab', { name: 'One-time password' }));
    type('Email or mobile number', '9876543210');
    fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }));

    expect(await screen.findByText('If the account exists, an OTP has been sent.')).toBeInTheDocument();
    type('One-time password', '654321');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(location()).toBe('/login-verification'));
    expect(api.callsTo('POST', '/auth/login/verify-otp')[0].body).toEqual({ identifier: '9876543210', otp: '654321' });
  });
});

describe('logout', () => {
  it('logs out from the dashboard and clears the session', async () => {
    sessionStorage.setItem('mm.accessToken', fakeAccessToken());
    const api = mockApi({
      'GET /auth/me': { status: 200, body: { success: true, data: USER } },
      'POST /auth/logout': { status: 200, body: { success: true, message: 'Logged out successfully' } },
    });
    renderApp('/dashboard');

    await screen.findByRole('heading', { name: /welcome/i });
    // Both the nav bar and the dashboard offer "Log out".
    fireEvent.click(screen.getAllByRole('button', { name: 'Log out' })[0]);
    await waitFor(() => expect(location()).toBe('/login'));
    expect(api.callsTo('POST', '/auth/logout')[0].headers.Authorization).toMatch(/^Bearer /);
    expect(sessionStorage.getItem('mm.accessToken')).toBeNull();
  });
});
