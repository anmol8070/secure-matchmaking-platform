/**
 * Live human/face presence verification page.
 * The camera (getUserMedia) and the MediaPipe detector are replaced with fakes;
 * everything else (auth state, routing, API calls) is real.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN, CHALLENGE, USER, mockApi, renderApp } from '../../test/renderApp.jsx';
import { CAMERA_ERRORS } from '../../hooks/useCamera.js';

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

const takePhoto = async () => {
  const button = await screen.findByRole('button', { name: 'Take photo' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};

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

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }), audio: false })
    );
    expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
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
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeInTheDocument();
  });
});

describe('face detection outcomes', () => {
  it('asks to retake the photo when no face is detected — nothing is sent', async () => {
    const api = await reachVerification();
    detector.detectFaces.mockResolvedValue({ faceCount: 0, detector: 'test' });
    await takePhoto();

    expect(await screen.findByText('No face detected. Please take the photo again.')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login-verification/complete')).toHaveLength(0);
    expect(location()).toBe('/login-verification');
  });

  it('asks for only one person when several faces are detected', async () => {
    const api = await reachVerification();
    detector.detectFaces.mockResolvedValue({ faceCount: 2, detector: 'test' });
    await takePhoto();

    expect(await screen.findByText('Multiple faces detected. Please ensure only one person is visible.')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login-verification/complete')).toHaveLength(0);
  });

  it('completes login with one face, sending only the result (never the image)', async () => {
    const api = await reachVerification({ 'POST /auth/login-verification/complete': SUCCESS(USER) });
    detector.detectFaces.mockResolvedValue({ faceCount: 1, confidence: 0.96, detector: 'mediapipe-blazeface-short-range' });
    await takePhoto();

    await waitFor(() => expect(location()).toBe('/dashboard'));
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
    detector.detectFaces.mockResolvedValue({ faceCount: 1, detector: 'test' });
    await takePhoto();

    await waitFor(() => expect(location()).toBe('/admin/dashboard'));
  });

  it('returns to login when the verification session has expired', async () => {
    await reachVerification({
      'POST /auth/login-verification/complete': {
        status: 401,
        body: { success: false, message: 'Invalid or expired verification session. Please log in again.' },
      },
    });
    detector.detectFaces.mockResolvedValue({ faceCount: 1, detector: 'test' });
    await takePhoto();

    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByText('Your verification session has expired. Please log in again.')).toBeInTheDocument();
    expect(sessionStorage.getItem('mm.accessToken')).toBeNull();
  });

  it('reports a detector loading failure and allows another try', async () => {
    await reachVerification();
    detector.detectFaces.mockRejectedValue(new Error('network'));
    await takePhoto();

    expect(
      await screen.findByText('Face detection could not be loaded. Check your internet connection and try again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled();
  });
});
