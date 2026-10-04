import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER, fakeAccessToken, mockApi, renderApp } from '../../../test/renderApp.jsx';

// The profile picture flow must never touch face detection.
const detector = vi.hoisted(() => ({ detectFaces: vi.fn(), preloadFaceDetector: vi.fn() }));
vi.mock('../../../services/faceDetectionService.js', () => detector);

const location = () => screen.getByTestId('location').textContent;
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

const PROFILE = {
  id: 7,
  userId: 7,
  name: 'Asha Patil',
  dateOfBirth: '1996-08-15',
  age: 30,
  gender: 'female',
  location: 'Kolhapur, Maharashtra, India',
  city: 'Kolhapur',
  state: 'Maharashtra',
  country: 'India',
  education: 'M.Tech',
  occupation: 'Software Developer',
  lifestyle: 'Active',
  bio: 'Loves trekking.',
  profilePhotoUrl: 'http://localhost:5000/media/profile-photos/old.webp',
  profileCompletion: { percentage: 100, completedFields: 9, totalFields: 9, missingFields: [] },
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

const ok = (data, message = 'Request successful') => ({ status: 200, body: { success: true, message, data } });
const NOT_FOUND = { status: 404, body: { success: false, message: 'Profile not found. Create your profile first.' } };

function signedIn(routes = {}) {
  sessionStorage.setItem('mm.accessToken', fakeAccessToken());
  return mockApi({ 'GET /auth/me': ok(USER), ...routes });
}

const imageFile = (name = 'mountains.png', mime = 'image/png', size = 2048) => new File([new Uint8Array(size)], name, { type: mime });

const pickFile = (file) => fireEvent.change(screen.getByTestId('photo-file-input'), { target: { files: [file] } });

beforeEach(() => {
  detector.detectFaces.mockReset();
});

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

describe('access', () => {
  it.each(['/profile', '/profile/create', '/profile/edit'])('redirects visitors from %s to /login', async (path) => {
    mockApi();
    renderApp(path);
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('sends users without a profile to "Complete your profile"', async () => {
    signedIn({ 'GET /profile': NOT_FOUND });
    renderApp('/profile');
    await waitFor(() => expect(location()).toBe('/profile/create'));
    expect(await screen.findByRole('heading', { name: 'Complete your profile' })).toBeInTheDocument();
  });
});

describe('profile view', () => {
  it('shows the profile, picture and completion', async () => {
    signedIn({ 'GET /profile': ok(PROFILE) });
    renderApp('/profile');

    expect(await screen.findByRole('heading', { name: 'Asha Patil' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Profile picture of Asha Patil' })).toHaveAttribute('src', PROFILE.profilePhotoUrl);
    for (const text of ['30', 'Kolhapur, Maharashtra, India', 'M.Tech', 'Software Developer', 'Active', 'Loves trekking.']) {
      expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Profile 100% complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/profile/edit');
  });

  it('shows a placeholder when there is no picture', async () => {
    signedIn({ 'GET /profile': ok({ ...PROFILE, profilePhotoUrl: null }) });
    renderApp('/profile');
    expect(await screen.findByRole('img', { name: 'No profile picture' })).toHaveTextContent('AP');
  });

  it('offers to complete the profile from the dashboard', async () => {
    signedIn({ 'GET /profile': NOT_FOUND });
    renderApp('/dashboard');
    expect(await screen.findByRole('link', { name: 'Complete profile' })).toHaveAttribute('href', '/profile/create');
  });
});

describe('create profile', () => {
  it('validates required fields and age before calling the API', async () => {
    const api = signedIn({ 'GET /profile': NOT_FOUND });
    renderApp('/profile/create');
    await screen.findByRole('heading', { name: 'Complete your profile' });

    type('Date of birth', `${new Date().getFullYear() - 15}-01-01`);
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('You must be at least 18 years old')).toBeInTheDocument();
    expect(api.callsTo('POST', '/profile')).toHaveLength(0);
  });

  it('creates the profile and shows it', async () => {
    const api = signedIn({
      'GET /profile': [NOT_FOUND, ok(PROFILE)],
      'POST /profile': { status: 201, body: { success: true, message: 'Profile created successfully', data: PROFILE } },
    });
    renderApp('/profile/create');
    await screen.findByRole('heading', { name: 'Complete your profile' });

    type('Full name', '  Asha Patil ');
    type('Date of birth', '1996-08-15');
    type('City', 'Kolhapur');
    type('Occupation', 'Software Developer');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(location()).toBe('/profile'));
    expect(api.callsTo('POST', '/profile')[0].body).toEqual({
      name: 'Asha Patil',
      dateOfBirth: '1996-08-15',
      gender: null,
      city: 'Kolhapur',
      state: null,
      country: null,
      education: null,
      occupation: 'Software Developer',
      lifestyle: null,
      bio: null,
    });
    expect(await screen.findByText('Profile created successfully.')).toBeInTheDocument();
  });

  it('uploads the chosen picture right after creating the profile (no face detection)', async () => {
    const api = signedIn({
      'GET /profile': [NOT_FOUND, ok(PROFILE)],
      'POST /profile': { status: 201, body: { success: true, data: { ...PROFILE, profilePhotoUrl: null } } },
      'PUT /profile/photo': ok(PROFILE, 'Profile picture updated successfully'),
    });
    renderApp('/profile/create');
    await screen.findByRole('heading', { name: 'Complete your profile' });

    pickFile(imageFile('landscape.png'));
    expect(screen.getByText('Preview — not saved yet')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Profile picture' })).toHaveAttribute('src', 'blob:preview/landscape.png');

    type('Full name', 'Asha Patil');
    type('Date of birth', '1996-08-15');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(location()).toBe('/profile'));
    const [upload] = api.callsTo('PUT', '/profile/photo');
    expect(upload.body).toBeInstanceOf(FormData);
    expect(upload.body.get('photo').name).toBe('landscape.png');
    expect(upload.headers['Content-Type']).toBeUndefined(); // browser sets the multipart boundary
    expect(detector.detectFaces).not.toHaveBeenCalled();
  });

  it('shows server-side validation errors next to the fields', async () => {
    signedIn({
      'GET /profile': NOT_FOUND,
      'POST /profile': {
        status: 422,
        body: { success: false, message: 'Validation failed', errors: [{ field: 'body.name', message: 'Name contains invalid characters' }] },
      },
    });
    renderApp('/profile/create');
    await screen.findByRole('heading', { name: 'Complete your profile' });
    type('Full name', 'Asha Patil');
    type('Date of birth', '1996-08-15');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Name contains invalid characters')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Validation failed');
  });
});

describe('edit profile', () => {
  it('pre-fills the form and saves changes', async () => {
    const api = signedIn({
      'GET /profile': [ok(PROFILE), ok({ ...PROFILE, occupation: 'Data Engineer' })],
      'PUT /profile': ok({ ...PROFILE, occupation: 'Data Engineer' }, 'Profile updated successfully'),
    });
    renderApp('/profile/edit');

    expect(await screen.findByLabelText('Full name')).toHaveValue('Asha Patil');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('1996-08-15');
    type('Occupation', 'Data Engineer');
    type('Lifestyle', '');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(location()).toBe('/profile'));
    expect(api.callsTo('PUT', '/profile')[0].body).toMatchObject({ occupation: 'Data Engineer', lifestyle: null, name: 'Asha Patil' });
    expect(api.callsTo('PUT', '/profile')[0].body.userId).toBeUndefined();
    expect(await screen.findByText('Profile updated successfully.')).toBeInTheDocument();
  });

  it('cancel returns to the profile without saving', async () => {
    const api = signedIn({ 'GET /profile': ok(PROFILE) });
    renderApp('/profile/edit');
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(location()).toBe('/profile'));
    expect(api.callsTo('PUT', '/profile')).toHaveLength(0);
  });
});

describe('profile picture', () => {
  async function openUploader(routes = {}) {
    const api = signedIn({ 'GET /profile': ok(PROFILE), ...routes });
    renderApp('/profile');
    fireEvent.click(await screen.findByRole('button', { name: 'Change photo' }));
    return api;
  }

  it('previews, uploads and displays a new picture', async () => {
    const updated = { ...PROFILE, profilePhotoUrl: 'http://localhost:5000/media/profile-photos/new.webp' };
    const api = await openUploader({ 'PUT /profile/photo': ok(updated, 'Profile picture updated successfully') });

    pickFile(imageFile('group-photo.jpg', 'image/jpeg'));
    const section = screen.getByRole('region', { name: 'Profile picture' });
    expect(within(section).getByRole('img')).toHaveAttribute('src', 'blob:preview/group-photo.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
    expect(await screen.findByText('Profile picture updated.')).toBeInTheDocument();
    expect(api.callsTo('PUT', '/profile/photo')).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getAllByRole('img', { name: 'Profile picture of Asha Patil' })[0]).toHaveAttribute('src', updated.profilePhotoUrl)
    );
    expect(detector.detectFaces).not.toHaveBeenCalled();
  });

  it.each([
    [imageFile('anim.gif', 'image/gif'), 'Use a JPG, PNG or WEBP image.'],
    [imageFile('huge.jpg', 'image/jpeg', 6 * 1024 * 1024), 'Image is too large. The maximum size is 5 MB.'],
  ])('rejects %s before uploading', async (file, message) => {
    const api = await openUploader();
    pickFile(file);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Save photo' })).not.toBeInTheDocument();
    expect(api.callsTo('PUT', '/profile/photo')).toHaveLength(0);
  });

  it('shows the server message when the upload is rejected', async () => {
    await openUploader({
      'PUT /profile/photo': { status: 415, body: { success: false, message: 'Unsupported image type. Use a JPG, PNG or WEBP image.' } },
    });
    pickFile(imageFile('renamed.png'));
    fireEvent.click(screen.getByRole('button', { name: 'Save photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported image type. Use a JPG, PNG or WEBP image.');
  });

  it('removes the picture and shows the placeholder', async () => {
    const api = await openUploader({ 'DELETE /profile/photo': ok({ ...PROFILE, profilePhotoUrl: null }, 'Profile picture removed') });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));

    expect(await screen.findByText('Profile picture removed.')).toBeInTheDocument();
    expect(api.callsTo('DELETE', '/profile/photo')).toHaveLength(1);
    expect(screen.getAllByRole('img', { name: 'No profile picture' }).length).toBeGreaterThan(0);
  });

  it('takes a picture with the camera and uploads it — without face detection', async () => {
    const track = { stop: vi.fn(), addEventListener: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getVideoTracks: () => [track] })) },
    });
    const api = await openUploader({ 'PUT /profile/photo': ok(PROFILE) });

    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    const capture = await screen.findByRole('button', { name: 'Capture' });
    await waitFor(() => expect(capture).toBeEnabled());
    fireEvent.click(capture);

    expect(track.stop).toHaveBeenCalled(); // camera switched off after capture
    fireEvent.click(await screen.findByRole('button', { name: 'Save photo' }));
    await screen.findByText('Profile picture updated.');

    const photo = api.callsTo('PUT', '/profile/photo')[0].body.get('photo');
    expect(photo.name).toBe('camera-photo.jpg');
    expect(photo.type).toBe('image/jpeg');
    expect(detector.detectFaces).not.toHaveBeenCalled();
  });

  it('suggests the gallery when camera permission is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))) },
    });
    await openUploader();
    fireEvent.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(await screen.findByText(/choose a picture from your gallery or files instead/)).toBeInTheDocument();
  });
});
