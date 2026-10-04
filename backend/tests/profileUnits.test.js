/** Unit tests for profile helpers (no database needed). */
const sharp = require('sharp');
const { detectImageType, validateUpload } = require('../src/services/profilePhotoService');
const { ageFromDateOfBirth, isValidDate } = require('../src/utils/age');
const { toResponse, COMPLETION_FIELDS } = require('../src/services/profileService');

const image = (format) => sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })[format]().toBuffer();

describe('image signature detection', () => {
  it.each(['jpeg', 'png', 'webp'])('recognises real %s files', async (format) => {
    expect(detectImageType(await image(format))).toBe(`image/${format}`);
  });

  it.each([
    ['gif', async () => image('gif')],
    ['text', async () => Buffer.from('hello')],
    ['empty', async () => Buffer.alloc(0)],
    ['svg', async () => Buffer.from('<svg/>')],
  ])('rejects %s', async (label, make) => {
    expect(detectImageType(await make())).toBeNull();
  });

  it('checks declared type, extension and real content together', async () => {
    const png = await image('png');
    expect(validateUpload({ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'a.PNG' })).toBe('image/png');
    expect(() => validateUpload({ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'a.gif' })).toThrow(/Unsupported/);
    expect(() => validateUpload({ buffer: png, size: png.length, mimetype: 'application/pdf', originalname: 'a.png' })).toThrow(/Unsupported/);
    expect(() => validateUpload(undefined)).toThrow(/Validation failed|Choose an image/);
  });
});

describe('age', () => {
  const today = new Date(Date.UTC(2026, 9, 4)); // 2026-10-04

  it.each([
    ['2000-10-04', 26], // birthday today
    ['2000-10-05', 25], // birthday tomorrow
    ['2000-02-29', 26],
    ['2008-10-04', 18],
  ])('%s → %i', (dob, age) => {
    expect(ageFromDateOfBirth(dob, today)).toBe(age);
  });

  it('validates calendar dates', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2023-02-29')).toBe(false);
    expect(isValidDate('1990-13-01')).toBe(false);
    expect(isValidDate('01-01-1990')).toBe(false);
  });
});

describe('profile response', () => {
  const row = {
    user_id: 5,
    name: 'Ravi',
    date_of_birth: '1990-01-31',
    gender: null,
    city: 'Pune',
    state: null,
    country: 'India',
    education: null,
    occupation: null,
    lifestyle: null,
    bio: null,
    profile_photo_url: '/media/profile-photos/0b1c4a43-5e2a-4c7e-9a6f-0123456789ab.webp',
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('computes completion deterministically from the documented fields', () => {
    expect(COMPLETION_FIELDS.map(([field]) => field)).toEqual([
      'name', 'dateOfBirth', 'gender', 'location', 'education', 'occupation', 'lifestyle', 'bio', 'profilePhoto',
    ]);
    expect(toResponse(row).profileCompletion).toEqual({
      percentage: 44,
      completedFields: 4,
      totalFields: 9,
      missingFields: ['gender', 'education', 'occupation', 'lifestyle', 'bio'],
    });
  });

  it('builds location and an absolute picture URL', () => {
    const res = toResponse(row);
    expect(res.location).toBe('Pune, India');
    expect(res.profilePhotoUrl).toMatch(/^http:\/\/localhost:\d+\/media\/profile-photos\/.+\.webp$/);
  });
});
