/**
 * Profile management (the authenticated user's own profile).
 *
 * The user id ALWAYS comes from the authenticated session (req.auth.userId),
 * never from the request, so one user cannot read or change another's profile.
 *
 * Profile pictures are handled by profilePhotoService. They are independent of
 * login verification: this module never calls verificationService and never
 * compares images.
 */
const Profile = require('../models/profileModel');
const ApiError = require('../utils/ApiError');
const { ageFromDateOfBirth } = require('../utils/age');
const { toPublicUrl } = require('./storage');
const profilePhotoService = require('./profilePhotoService');

const MESSAGES = Object.freeze({
  NOT_FOUND: 'Profile not found. Create your profile first.',
  ALREADY_EXISTS: 'You already have a profile. Use PUT /api/v1/profile to update it.',
  PHOTO_NEEDS_PROFILE: 'Create your profile before adding a profile picture.',
});

// API field → profiles column (the only columns this API can write).
const COLUMNS = Object.freeze({
  name: 'name',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
  city: 'city',
  state: 'state',
  country: 'country',
  education: 'education',
  occupation: 'occupation',
  lifestyle: 'lifestyle',
  bio: 'bio',
});

/**
 * Fields counted for profile completion (each worth an equal share). Derived on
 * every read — not stored, and not used for matching or ranking.
 */
const COMPLETION_FIELDS = Object.freeze([
  ['name', (p) => p.name],
  ['dateOfBirth', (p) => p.date_of_birth],
  ['gender', (p) => p.gender],
  ['location', (p) => p.city || p.state || p.country],
  ['education', (p) => p.education],
  ['occupation', (p) => p.occupation],
  ['lifestyle', (p) => p.lifestyle],
  ['bio', (p) => p.bio],
  ['profilePhoto', (p) => p.profile_photo_url],
]);

function completionOf(row) {
  const missing = COMPLETION_FIELDS.filter(([, filled]) => !filled(row)).map(([field]) => field);
  const completed = COMPLETION_FIELDS.length - missing.length;
  return {
    percentage: Math.round((completed / COMPLETION_FIELDS.length) * 100),
    completedFields: completed,
    totalFields: COMPLETION_FIELDS.length,
    missingFields: missing,
  };
}

/** Public representation — profile data only, no account or security fields. */
function toResponse(row) {
  return {
    id: row.user_id,
    userId: row.user_id,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    age: ageFromDateOfBirth(row.date_of_birth),
    gender: row.gender,
    location: [row.city, row.state, row.country].filter(Boolean).join(', ') || null,
    city: row.city,
    state: row.state,
    country: row.country,
    education: row.education,
    occupation: row.occupation,
    lifestyle: row.lifestyle,
    bio: row.bio,
    profilePhotoUrl: toPublicUrl(row.profile_photo_url),
    profileCompletion: completionOf(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toColumns(data) {
  return Object.fromEntries(
    Object.entries(COLUMNS)
      .filter(([field]) => data[field] !== undefined)
      .map(([field, column]) => [column, data[field]])
  );
}

async function findOwn(userId) {
  const row = await Profile.findByPk(userId);
  if (!row) throw ApiError.notFound(MESSAGES.NOT_FOUND);
  return row;
}

async function getOwnProfile(userId) {
  return toResponse(await findOwn(userId));
}

async function createProfile(userId, data) {
  if (await Profile.findByPk(userId)) throw ApiError.conflict(MESSAGES.ALREADY_EXISTS);
  // A concurrent duplicate still fails on the primary key → 409 via errorHandler.
  await Profile.query().insert({ user_id: userId, ...toColumns(data) });
  return getOwnProfile(userId);
}

async function updateProfile(userId, data) {
  await findOwn(userId);
  await Profile.query().where({ user_id: userId }).update(toColumns(data));
  return getOwnProfile(userId);
}

/**
 * Stores the new picture first, then points the profile at it, and only then
 * deletes the previous file — a failure never leaves the profile without a photo.
 */
async function uploadProfilePhoto(userId, file) {
  const profile = await Profile.findByPk(userId);
  if (!profile) throw ApiError.notFound(MESSAGES.PHOTO_NEEDS_PROFILE);

  const newUrl = await profilePhotoService.storeProfilePhoto(file);
  try {
    await Profile.query().where({ user_id: userId }).update({ profile_photo_url: newUrl });
  } catch (err) {
    await profilePhotoService.deleteStoredPhoto(newUrl);
    throw err;
  }
  await profilePhotoService.deleteStoredPhoto(profile.profile_photo_url);
  return getOwnProfile(userId);
}

/** Clears the picture (the profile itself is kept). Idempotent. */
async function removeProfilePhoto(userId) {
  const profile = await findOwn(userId);
  if (profile.profile_photo_url) {
    await Profile.query().where({ user_id: userId }).update({ profile_photo_url: null });
    await profilePhotoService.deleteStoredPhoto(profile.profile_photo_url);
  }
  return getOwnProfile(userId);
}

module.exports = {
  getOwnProfile,
  createProfile,
  updateProfile,
  uploadProfilePhoto,
  removeProfilePhoto,
  toResponse,
  COMPLETION_FIELDS,
  MESSAGES,
};
