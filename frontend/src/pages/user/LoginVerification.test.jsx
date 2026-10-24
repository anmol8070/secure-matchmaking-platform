/**
 * Live human/face presence verification page.
 * The camera (getUserMedia) and the MediaPipe detector are replaced with fakes;
 * everything else (auth state, routing, API calls) is real.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN, CHALLENGE, USER, mockApi, renderApp } from '../../test/renderApp.jsx';
import { CAMERA_ERRORS } from '../../hooks/useCamera.js';
import { VERIFICATION_MESSAGES, markerEllipse, nextGuideStep } from './LoginVerification.jsx';

const detector = vi.hoisted(() => ({ detectFaces: vi.fn(), preloadFaceDetector: vi.fn(() => Promise.resolve()) }));
vi.mock('../../services/faceDetectionService.js', () => detector);

const location = () => screen.getByTestId('location').textContent;

const stopTrack = vi.fn();
function fakeStream() {
  const track = { stop: stopTrack, addEventListener: vi.fn() };
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}

function setCamera(getUserMedia) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: getUserMedia && { getUserMedia } });
}

const SUCCESS = (user) => ({
  status: 200,
  body: {
    success: true,
    message: 'Login verification successful',
    data: { access_token: 'header.payload.signature', token_type: 'Bearer', expires_in: 86400, user },
  },
});

/** Logs in through the real login page so the app holds a verification token. */
async function reachVerification(routes = {}, { admin = false } = {}) {
  const api = mockApi({ 'POST /auth/login': CHALLENGE, 'POST /admin/login': CHALLENGE, ...routes });
  renderApp(admin ? '/admin/login' : '/login');
  fireEvent.change(screen.getByLabelText('Email or mobile number'), { target: { value: 'asha@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secure123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(location()).toBe('/login-verification'));
  return api;
}

/** A whole face inside the 640×480 marker. Shifts stay inside the oval. */
const fittedBox = (dx = 0, dy = 0, dw = 0, dh = 0) => ({
  x: 227 + dx,
  y: 100 + dy,
  w: 186 + dw,
  h: 242 + dh,
});

/** Two frames of one face that actually moves, so the still-photo check passes. */
function mockLivePerson(extra = {}) {
  const first = { faceCount: 1, detector: 'test', box: fittedBox(), ...extra };
  const second = { ...first, box: fittedBox(24, 16, -12, -14) };
  detector.detectFaces.mockResolvedValueOnce(first).mockResolvedValue(second);
}

beforeEach(() => {
  setCamera(vi.fn(() => Promise.resolve(fakeStream())));
  detector.detectFaces.mockReset();
  stopTrack.mockClear();
});

afterEach(() => {
  setCamera(undefined);
});

describe('camera permission and availability', () => {
  it('opens the live camera after credentials are verified (permission granted)', async () => {
    await reachVerification();

    // The camera opens from an effect, so wait for it instead of asserting synchronously.
    await waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }), audio: false })
      )
    );
    expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
    expect(screen.getByTestId('face-marker')).toBeInTheDocument();
  });

  it.each([
    ['NotAllowedError', CAMERA_ERRORS.permission_denied],
    ['NotFoundError', CAMERA_ERRORS.no_camera],
    ['NotReadableError', CAMERA_ERRORS.unavailable],
    ['TypeError', CAMERA_ERRORS.stream_failed],
  ])('explains %s and does not continue to the dashboard', async (name, message) => {
    setCamera(vi.fn(() => Promise.reject(Object.assign(new Error(name), { name }))));
    await reachVerification();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(location()).toBe('/login-verification');
  });

  it('explains when the browser has no camera API', async () => {
    setCamera(undefined);
    await reachVerification();
    expect(await screen.findByText(CAMERA_ERRORS.unsupported)).toBeInTheDocument();
  });

  it('lets the user retry after granting permission', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      .mockResolvedValue(fakeStream());
    setCamera(getUserMedia);
    await reachVerification();

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
  });
});

describe('face detection outcomes', () => {
  it('asks to retake the photo when no face is detected — nothing is sent', async () => {
    const api = await reachVerification();
    detector.detectFaces.mockResolvedValue({ faceCount: 0, detector: 'test' });

    expect(await screen.findByText(VERIFICATION_MESSAGES.noFace)).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login-verification/complete')).toHaveLength(0);
    expect(location()).toBe('/login-verification');
  });

  it('captures a face that stays in the marker and saves it when there is no profile picture', async () => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = (callback) => {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    };
    const api = await reachVerification({
      'POST /auth/login-verification/complete': SUCCESS(USER),
      'PUT /profile/photo': { status: 200, body: { success: true, message: 'Profile picture updated.', data: {} } },
    });
    detector.detectFaces.mockResolvedValue({ faceCount: 1, box: fittedBox(), detector: 'test' });

    await waitFor(() => expect(location()).toBe('/dashboard'), { timeout: 4000 });
    expect(api.callsTo('POST', '/auth/login-verification/complete').length).toBeGreaterThan(0);
    expect(api.callsTo('PUT', '/profile/photo')[0].body).toBeInstanceOf(FormData);
    HTMLCanvasElement.prototype.toBlob = original;
  });

  it('asks for only one person when several faces are detected', async () => {
    const api = await reachVerification();
    detector.detectFaces.mockResolvedValue({ faceCount: 2, detector: 'test' });

    expect(await screen.findByText('Multiple faces detected. Please ensure only one person is visible.')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login-verification/complete')).toHaveLength(0);
  });

  it('completes login with one face, sending only the result (never the image)', async () => {
    const api = await reachVerification({ 'POST /auth/login-verification/complete': SUCCESS(USER) });
    mockLivePerson({ confidence: 0.96, detector: 'mediapipe-blazeface-short-range' });

    await waitFor(() => expect(location()).toBe('/dashboard'), { timeout: 3000 });
    const [call] = api.callsTo('POST', '/auth/login-verification/complete');
    expect(call.body).toEqual({
      verification_token: 'v'.repeat(43),
      face_detected: true,
      face_count: 1,
      confidence: 0.96,
      detector: 'mediapipe-blazeface-short-range',
    });
    expect(sessionStorage.getItem('mm.accessToken')).toBe('header.payload.signature');
    expect(stopTrack).toHaveBeenCalled(); // camera switched off
    // The detector received an in-memory canvas, not an uploaded file.
    expect(detector.detectFaces.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
  });

  it('sends admins to the admin dashboard', async () => {
    await reachVerification({ 'POST /auth/login-verification/complete': SUCCESS(ADMIN) }, { admin: true });
    mockLivePerson();

    await waitFor(() => expect(location()).toBe('/admin/dashboard'), { timeout: 3000 });
  });

  /** Opens a protected URL while signed out, then signs in through the real pages. */
  async function signInFrom(path, user, loginPath) {
    mockApi({ 'POST /auth/login': CHALLENGE, 'POST /admin/login': CHALLENGE, 'POST /auth/login-verification/complete': SUCCESS(user) });
    renderApp(path);
    await waitFor(() => expect(location()).toBe(loginPath));
    fireEvent.change(screen.getByLabelText('Email or mobile number'), { target: { value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secure123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(location()).toBe('/login-verification'));
    mockLivePerson();
  }

  it('returns a member to the page they originally opened (Phase 15 deep links)', async () => {
    await signInFrom('/chat/9', USER, '/login');
    await waitFor(() => expect(location()).toBe('/chat/9'), { timeout: 3000 });
  });

  it('returns an admin to the admin page they originally opened', async () => {
    await signInFrom('/admin/reports/5', ADMIN, '/admin/login');
    await waitFor(() => expect(location()).toBe('/admin/reports/5'), { timeout: 3000 });
  });

  it('returns to login when the verification session has expired', async () => {
    await reachVerification({
      'POST /auth/login-verification/complete': {
        status: 401,
        body: { success: false, message: 'Invalid or expired verification session. Please log in again.' },
      },
    });
    mockLivePerson();

    await waitFor(() => expect(location()).toBe('/login'), { timeout: 3000 });
    expect(await screen.findByText('Your verification session has expired. Please log in again.')).toBeInTheDocument();
    expect(sessionStorage.getItem('mm.accessToken')).toBeNull();
  });

  it('does not send a profile-match flag, even when the account already has a photo', async () => {
    const api = await reachVerification({
      'POST /auth/login': {
        ...CHALLENGE,
        body: {
          ...CHALLENGE.body,
          data: { ...CHALLENGE.body.data, has_profile_photo: true },
        },
      },
      'POST /auth/login-verification/complete': SUCCESS(USER),
    });
    mockLivePerson({ confidence: 0.96, detector: 'mediapipe-blazeface-short-range' });

    await waitFor(() => expect(location()).toBe('/dashboard'), { timeout: 3000 });
    const body = api.callsTo('POST', '/auth/login-verification/complete')[0].body;
    expect(body.face_count).toBe(1);
    expect(body.profile_matched).toBeUndefined();
    expect(api.callsTo('PUT', '/profile/photo')).toHaveLength(0);
  });

  it('reports a detector loading failure and allows another try', async () => {
    await reachVerification();
    detector.detectFaces.mockRejectedValue(new Error('network'));

    expect(
      await screen.findByText('Face detection could not be loaded. Check your internet connection and try again.')
    ).toBeInTheDocument();
    expect(location()).toBe('/login-verification');
  });
});

describe('face marker', () => {
  const ellipse = markerEllipse(640, 480);
  const still = { faceCount: 1, box: fittedBox() };

  it('captures a face that stays centered inside the marker', () => {
    let step = nextGuideStep(null, still, ellipse, 0);
    let passed = false;
    for (let i = 0; i < 8 && !passed; i += 1) {
      if (step.type === 'pass') passed = true;
      else step = nextGuideStep(step.previous, still, ellipse, step.stillCount);
    }
    expect(passed).toBe(true);
  });

  it('accepts one face once it moves while fully inside the marker', () => {
    const first = nextGuideStep(null, still, ellipse, 0);
    const moved = { faceCount: 1, box: fittedBox(24, 16, -12, -14) };
    const second = nextGuideStep(first.previous, moved, ellipse, first.stillCount);
    expect(second.type).toBe('pass');
  });

  it('accepts a face that fills the marker even when the box corners cross the oval', () => {
    const filling = { faceCount: 1, box: { x: 180, y: 41, w: 280, h: 360 } };
    const step = nextGuideStep(null, filling, ellipse, 0);
    expect(step.hint).toBe(VERIFICATION_MESSAGES.holdStill);
    expect(step.previous).not.toBeNull();
  });

  it('does not capture when the face center is outside the marker', () => {
    const outside = { faceCount: 1, box: { x: 8, y: 8, w: 180, h: 220 } };
    const step = nextGuideStep(still, outside, ellipse, 3);
    expect(step.type).toBeUndefined();
    expect(step.hint).toBe(VERIFICATION_MESSAGES.centerFace);
    expect(step.previous).toBeNull();
  });

  it('does not capture a face that is too small to fill the marker', () => {
    const distant = { faceCount: 1, box: { x: 280, y: 190, w: 80, h: 90 } };
    const step = nextGuideStep(null, distant, ellipse, 0);
    expect(step.type).toBeUndefined();
    expect(step.hint).toBe(VERIFICATION_MESSAGES.moveCloser);
  });
});
