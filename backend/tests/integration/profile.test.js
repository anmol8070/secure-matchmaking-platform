/**
 * Phase 5 profile integration tests — real HTTP requests, real database,
 * real image processing and local storage (UPLOADS_DIR = a temp folder).
 *
 * Run with: npm run test:db
 */
const config = require('../../src/config/environment');

const TEST_DB = process.env.DB_TEST_DATABASE || `${config.db.database}_test`;
config.db.database = TEST_DB;

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const sharp = require('sharp');
const { getDb, closeConnection } = require('../../src/config/database');
const { createDatabase } = require('../../scripts/db-create');
const { createApp } = require('../../src/app');
const devOutbox = require('../../src/services/otpDelivery/devOtpProvider');
const verificationService = require('../../src/services/verificationService');

const app = createApp({ corsOrigins: [] });
const PASSWORD = 'Secure123';
const ONE_FACE = { face_detected: true, face_count: 1 };

let db;
let seq = 0;

/* ---------------- helpers ---------------- */

async function signUpAndLogin() {
  const email = `profile${(seq += 1)}_${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  await request(app).post('/api/v1/auth/verify-otp').send({ email, otp: devOutbox.peek(email).code });
  const login = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
  const done = await request(app)
    .post('/api/v1/auth/login-verification/complete')
    .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
  return { email, userId: reg.body.data.user_id, token: done.body.data.access_token };
}

const as = (token) => ({
  get: (p) => request(app).get(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body) => request(app).post(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  put: (p, body) => request(app).put(`/api/v1${p}`).set('Authorization', `Bearer ${token}`).send(body),
  delete: (p) => request(app).delete(`/api/v1${p}`).set('Authorization', `Bearer ${token}`),
  upload: (buffer, filename, contentType) =>
    request(app)
      .put('/api/v1/profile/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', buffer, { filename, contentType }),
});

const VALID_PROFILE = {
  name: 'Asha Patil',
  dateOfBirth: '1996-08-15',
  gender: 'female',
  city: 'Kolhapur',
  state: 'Maharashtra',
  country: 'India',
  education: 'M.Tech',
  occupation: 'Software Developer',
  lifestyle: 'Active, vegetarian',
  bio: 'Loves trekking and old Marathi songs.',
};

const expectedAge = (dob) => {
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  return now.getUTCFullYear() - y - (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d) ? 1 : 0);
};

/** A landscape-like image with no face in it. */
const landscapePng = (w = 400, h = 300) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#4a8f3c' } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h / 2}"><rect width="100%" height="100%" fill="#7ec8e3"/></svg>`), top: 0, left: 0 }])
    .png()
    .toBuffer();

const jpegWithExif = () =>
  sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c86' } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'private-owner-name', Artist: 'secret-artist' }, IFD3: { GPSLatitudeRef: 'N' } })
    .toBuffer();

const webp = () => sharp({ create: { width: 200, height: 200, channels: 3, background: '#333' } }).webp().toBuffer();

/** Random noise compresses badly → a PNG larger than the 1 MB test limit. */
const oversizedPng = () =>
  sharp(crypto.randomBytes(800 * 800 * 3), { raw: { width: 800, height: 800, channels: 3 } }).png().toBuffer();

const storedFile = (url) => path.join(config.media.uploadsDir, new URL(url).pathname.replace(/^\/media\//, ''));

/* ---------------- setup ---------------- */

beforeAll(async () => {
  await createDatabase(TEST_DB);
  db = getDb();
  await db.migrate.latest();
}, 60000);

afterAll(async () => {
  await closeConnection();
});

/* ---------------- authentication ---------------- */

describe('authentication', () => {
  it.each([
    ['get', '/api/v1/profile'],
    ['post', '/api/v1/profile'],
    ['put', '/api/v1/profile'],
    ['put', '/api/v1/profile/photo'],
    ['delete', '/api/v1/profile/photo'],
  ])('%s %s requires a valid access token', async (method, url) => {
    const res = await request(app)[method](url).send(VALID_PROFILE);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Authentication required' });
  });
});

/* ---------------- create / view ---------------- */

describe('create and view', () => {
  it('creates the profile for the logged-in user and returns it', async () => {
    const { token, userId } = await signUpAndLogin();
    const res = await as(token).post('/profile', VALID_PROFILE);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, message: 'Profile created successfully' });
    expect(res.body.data).toEqual({
      id: userId,
      userId,
      name: 'Asha Patil',
      dateOfBirth: '1996-08-15',
      age: expectedAge('1996-08-15'),
      gender: 'female',
      location: 'Kolhapur, Maharashtra, India',
      city: 'Kolhapur',
      state: 'Maharashtra',
      country: 'India',
      education: 'M.Tech',
      occupation: 'Software Developer',
      lifestyle: 'Active, vegetarian',
      bio: 'Loves trekking and old Marathi songs.',
      profilePhotoUrl: null,
      profileCompletion: {
        percentage: 89,
        completedFields: 8,
        totalFields: 9,
        missingFields: ['profilePhoto'],
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const view = await as(token).get('/profile');
    expect(view.status).toBe(200);
    expect(view.body.data).toEqual(res.body.data);
  });

  it('creates a minimal profile with only the required fields', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).post('/profile', { name: 'Ravi', dateOfBirth: '1990-01-31' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ location: null, bio: null, profilePhotoUrl: null });
    expect(res.body.data.profileCompletion).toMatchObject({ percentage: 22, completedFields: 2 });
  });

  it('returns 404 before a profile exists and 409 on a second create', async () => {
    const { token } = await signUpAndLogin();
    const missing = await as(token).get('/profile');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ success: false, message: 'Profile not found. Create your profile first.' });

    expect((await as(token).post('/profile', VALID_PROFILE)).status).toBe(201);
    const again = await as(token).post('/profile', VALID_PROFILE);
    expect(again.status).toBe(409);
  });

  it('sanitises text input', async () => {
    const { token } = await signUpAndLogin();
    const res = await as(token).post('/profile', {
      name: '  Asha   Patil ',
      dateOfBirth: ' 1996-08-15 ',
      occupation: 'Software\tDeveloper',
      bio: 'Line one\r\n\r\n\r\n\r\nLine two\u0007 <3',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Asha Patil',
      occupation: 'Software Developer',
      bio: 'Line one\n\nLine two <3',
    });
  });

  it.each([
    [{ name: 'Teen', dateOfBirth: `${new Date().getUTCFullYear() - 16}-01-01` }, 'dateOfBirth', 'You must be at least 18 years old'],
    [{ name: 'Old', dateOfBirth: '1900-01-01' }, 'dateOfBirth', 'Age must be 100 or less'],
    [{ name: 'Bad', dateOfBirth: '1990-02-30' }, 'dateOfBirth', 'Enter a valid date of birth (YYYY-MM-DD)'],
    [{ name: 'Bad', dateOfBirth: 25 }, 'dateOfBirth', 'Date of birth is required'],
    [{ dateOfBirth: '1990-01-01' }, 'name', 'Name is required'],
    [{ name: 'A', dateOfBirth: '1990-01-01' }, 'name', 'Name must be at least 2 characters'],
    [{ name: '<script>alert(1)</script>', dateOfBirth: '1990-01-01' }, 'name', 'Name contains characters that are not allowed (< or >)'],
    [{ name: 'Valid Name', dateOfBirth: '1990-01-01', city: 'Pune123' }, 'city', 'City can contain letters, spaces, apostrophes, dots and hyphens'],
    [{ name: 'Valid Name', dateOfBirth: '1990-01-01', bio: 'x'.repeat(2001) }, 'bio', 'Bio must be at most 2000 characters'],
    [{ name: 'Valid Name', dateOfBirth: '1990-01-01', gender: 'robot' }, 'gender', 'Gender must be one of: male, female, non_binary, other, prefer_not_to_say'],
  ])('rejects invalid profile data %j', async (body, field, message) => {
    const { token } = await signUpAndLogin();
    const res = await as(token).post('/profile', body);

    expect(res.status).toBe(422);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toContainEqual({ field: `body.${field}`, message });
  });
});

/* ---------------- update ---------------- */

describe('update', () => {
  it('updates only the provided fields and refreshes updatedAt', async () => {
    const { token } = await signUpAndLogin();
    const created = (await as(token).post('/profile', VALID_PROFILE)).body.data;
    await db('profiles').update({ updated_at: new Date('2020-01-01T00:00:00Z') });

    const res = await as(token).put('/profile', { occupation: 'Data Engineer', city: 'Pune', bio: null });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile updated successfully');
    expect(res.body.data).toMatchObject({
      name: created.name,
      dateOfBirth: created.dateOfBirth,
      occupation: 'Data Engineer',
      city: 'Pune',
      bio: null,
      location: 'Pune, Maharashtra, India',
    });
    expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThan(new Date('2021-01-01').getTime());
  });

  it('returns 404 when updating a profile that does not exist', async () => {
    const { token } = await signUpAndLogin();
    expect((await as(token).put('/profile', { name: 'Someone' })).status).toBe(404);
  });

  it('rejects an empty update and invalid values', async () => {
    const { token } = await signUpAndLogin();
    await as(token).post('/profile', VALID_PROFILE);

    expect((await as(token).put('/profile', {})).status).toBe(422);
    expect((await as(token).put('/profile', { dateOfBirth: '2020-01-01' })).status).toBe(422);
    expect((await as(token).put('/profile', { name: null })).status).toBe(422);
  });

  it.each([
    [{ userId: 999 }],
    [{ user_id: 999 }],
    [{ role: 'admin' }],
    [{ status: 'active' }],
    [{ password_hash: 'x' }],
    [{ email: 'other@example.com' }],
    [{ profile_photo_url: 'https://evil.example.com/x.jpg' }],
  ])('refuses to change account/security data through the profile API: %j', async (extra) => {
    const { token, userId } = await signUpAndLogin();
    await as(token).post('/profile', VALID_PROFILE);
    const before = await db('users').where({ user_id: userId }).first();

    const res = await as(token).put('/profile', { name: 'New Name', ...extra });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].message).toMatch(/Unrecognized key/);

    const after = await db('users').where({ user_id: userId }).first();
    expect(after).toEqual(before);
    expect((await db('profiles').where({ user_id: userId }).first()).name).toBe(VALID_PROFILE.name);
  });

  it("never lets one user read or modify another user's profile", async () => {
    const alice = await signUpAndLogin();
    const bob = await signUpAndLogin();
    await as(alice.token).post('/profile', { ...VALID_PROFILE, name: 'Alice' });
    await as(bob.token).post('/profile', { ...VALID_PROFILE, name: 'Bob' });

    // Body cannot target another user…
    expect((await as(alice.token).put('/profile', { userId: bob.userId, name: 'Hacked' })).status).toBe(422);
    // …a user id in the URL is not an update route…
    expect((await as(alice.token).put(`/profile/${bob.userId}`, { name: 'Hacked' })).status).toBe(404);
    // …and each token only ever sees its own profile.
    await as(alice.token).put('/profile', { name: 'Alice Updated' });
    expect((await as(bob.token).get('/profile')).body.data).toMatchObject({ userId: bob.userId, name: 'Bob' });
    expect((await as(alice.token).get('/profile')).body.data).toMatchObject({ userId: alice.userId, name: 'Alice Updated' });

    // Viewing other members comes in a later phase.
    expect((await as(alice.token).get(`/profile/${bob.userId}`)).status).toBe(501);
  });
});

/* ---------------- profile picture ---------------- */

describe('profile picture', () => {
  let user;

  beforeEach(async () => {
    user = await signUpAndLogin();
    await as(user.token).post('/profile', VALID_PROFILE);
  });

  it('uploads a picture with no face in it (no face/human detection)', async () => {
    const res = await as(user.token).upload(await landscapePng(), 'mountains.png', 'image/png');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile picture updated successfully');
    expect(res.body.data.profilePhotoUrl).toMatch(/^http:\/\/localhost:\d+\/media\/profile-photos\/[0-9a-f-]{36}\.webp$/);
    expect(res.body.data.profileCompletion).toMatchObject({ percentage: 100, missingFields: [] });

    const stored = await db('profiles').where({ user_id: user.userId }).first();
    expect(stored.profile_photo_url).toMatch(/^\/media\/profile-photos\/.+\.webp$/); // reference only, no binary
    expect(fs.existsSync(storedFile(res.body.data.profilePhotoUrl))).toBe(true);
  });

  it('accepts JPEG and WEBP, re-encodes to bounded WEBP and strips metadata (EXIF/GPS)', async () => {
    const jpeg = await jpegWithExif();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const res = await as(user.token).upload(jpeg, 'IMG_0001.JPG', 'image/jpeg');
    expect(res.status).toBe(200);
    const meta = await sharp(storedFile(res.body.data.profilePhotoUrl)).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBe(config.profileImage.maxDimension);
    expect(meta.exif).toBeUndefined();
    expect(fs.readFileSync(storedFile(res.body.data.profilePhotoUrl)).includes('private-owner-name')).toBe(false);

    expect((await as(user.token).upload(await webp(), 'avatar.webp', 'image/webp')).status).toBe(200);
  });

  it('serves the stored image publicly so it can be displayed', async () => {
    const res = await as(user.token).upload(await landscapePng(), 'a.png', 'image/png');
    const image = await request(app).get(new URL(res.body.data.profilePhotoUrl).pathname);

    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([
    ['a GIF', () => sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer(), 'a.gif', 'image/gif'],
    ['text renamed to .png', async () => Buffer.from('not really an image'), 'fake.png', 'image/png'],
    ['a PNG declared as text', landscapePng, 'photo.png', 'text/plain'],
    ['a PNG with a .exe name', landscapePng, 'photo.exe', 'image/png'],
    ['an SVG', async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml'],
  ])('rejects %s with 415', async (label, make, filename, contentType) => {
    const res = await as(user.token).upload(await make(), filename, contentType);
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ success: false, message: 'Unsupported image type. Use a JPG, PNG or WEBP image.' });
  });

  it('rejects a corrupt image that only has a valid signature', async () => {
    const corrupt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
    const res = await as(user.token).upload(corrupt, 'broken.png', 'image/png');
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('The file is not a valid image.');
  });

  it('rejects an oversized image with 413', async () => {
    const big = await oversizedPng();
    expect(big.length).toBeGreaterThan(config.profileImage.maxSizeMb * 1024 * 1024);

    const res = await as(user.token).upload(big, 'big.png', 'image/png');
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ success: false, message: `Image is too large. The maximum size is ${config.profileImage.maxSizeMb} MB.` });
  });

  it('requires a file in the "photo" field', async () => {
    const none = await request(app).put('/api/v1/profile/photo').set('Authorization', `Bearer ${user.token}`);
    expect(none.status).toBe(422);

    const wrongField = await request(app)
      .put('/api/v1/profile/photo')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', await landscapePng(), 'a.png');
    expect(wrongField.status).toBe(400);
  });

  it('replaces the picture: new file stored, old file deleted', async () => {
    const first = (await as(user.token).upload(await landscapePng(), 'one.png', 'image/png')).body.data.profilePhotoUrl;
    const second = (await as(user.token).upload(await webp(), 'two.webp', 'image/webp')).body.data.profilePhotoUrl;

    expect(second).not.toBe(first);
    expect(fs.existsSync(storedFile(second))).toBe(true);
    expect(fs.existsSync(storedFile(first))).toBe(false);
  });

  it('keeps the existing picture when a replacement upload is invalid', async () => {
    const first = (await as(user.token).upload(await landscapePng(), 'one.png', 'image/png')).body.data.profilePhotoUrl;
    expect((await as(user.token).upload(Buffer.from('nope'), 'x.png', 'image/png')).status).toBe(415);

    expect((await as(user.token).get('/profile')).body.data.profilePhotoUrl).toBe(first);
    expect(fs.existsSync(storedFile(first))).toBe(true);
  });

  it('removes the picture but keeps the profile', async () => {
    const url = (await as(user.token).upload(await landscapePng(), 'one.png', 'image/png')).body.data.profilePhotoUrl;
    const res = await as(user.token).delete('/profile/photo');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Profile picture removed', data: { profilePhotoUrl: null, name: VALID_PROFILE.name } });
    expect(fs.existsSync(storedFile(url))).toBe(false);
    // Removing again is harmless.
    expect((await as(user.token).delete('/profile/photo')).status).toBe(200);
  });

  it('needs a profile before a picture can be added', async () => {
    const fresh = await signUpAndLogin();
    const res = await as(fresh.token).upload(await landscapePng(), 'a.png', 'image/png');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Create your profile before adding a profile picture.');
  });
});

/* ---------------- independence from login verification ---------------- */

describe('independence from live human/face presence verification', () => {
  it('never calls the verification service when uploading or removing a picture', async () => {
    const { token } = await signUpAndLogin();
    await as(token).post('/profile', VALID_PROFILE);
    const spies = Object.keys(verificationService)
      .filter((key) => typeof verificationService[key] === 'function')
      .map((key) => jest.spyOn(verificationService, key));

    await as(token).upload(await landscapePng(), 'mountains.png', 'image/png');
    await as(token).delete('/profile/photo');

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((spy) => spy.mockRestore());
  });

  it('does not touch login_verifications when the picture changes', async () => {
    const { token, userId } = await signUpAndLogin();
    await as(token).post('/profile', VALID_PROFILE);
    const before = await db('login_verifications').where({ user_id: userId }).orderBy('verification_id');

    await as(token).upload(await landscapePng(), 'a.png', 'image/png');
    await as(token).upload(await webp(), 'b.webp', 'image/webp');

    expect(await db('login_verifications').where({ user_id: userId }).orderBy('verification_id')).toEqual(before);
  });

  it('login verification still works the same with or without a profile picture', async () => {
    const { email, token } = await signUpAndLogin();
    await as(token).post('/profile', VALID_PROFILE);
    await as(token).upload(await landscapePng(), 'no-face.png', 'image/png');

    const login = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
    const done = await request(app)
      .post('/api/v1/auth/login-verification/complete')
      .send({ verification_token: login.body.data.verification_token, ...ONE_FACE });
    expect(done.status).toBe(200);
  });
});

/* ---------------- data exposure ---------------- */

describe('sensitive data', () => {
  it('profile responses contain no password, OTP, token or account security fields', async () => {
    const { token } = await signUpAndLogin();
    const responses = [
      await as(token).post('/profile', VALID_PROFILE),
      await as(token).get('/profile'),
      await as(token).put('/profile', { bio: 'Updated' }),
      await as(token).upload(await landscapePng(), 'a.png', 'image/png'),
      await as(token).delete('/profile/photo'),
    ];
    for (const res of responses) {
      expect(res.status).toBeLessThan(300);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/password|hash|otp|token|secret|role|"status"|email|mobile|uploads[\\/]|[A-Z]:\\\\/i);
    }
  });
});
