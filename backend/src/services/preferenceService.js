/**
 * Matching preferences (preferences table) for the authenticated user.
 *
 * Stores clean, structured data for the future compatibility engine. It does
 * NOT score, weight, rank or recommend anything — no compatibility weights
 * live here.
 *
 * The user id always comes from the session. Preferences, hobbies and quiz
 * answers sent together are written in ONE transaction: if any part fails,
 * nothing is saved.
 */
const { getDb } = require('../config/database');
const Preference = require('../models/preferenceModel');
const ApiError = require('../utils/ApiError');
const hobbyService = require('./hobbyService');
const quizService = require('./quizService');
const {
  FOOD_PREFERENCES,
  PARTNER_GENDERS,
  PARTNER_AGE,
  MAX_HOBBIES,
} = require('../validators/preferenceValidator');

const MESSAGES = Object.freeze({
  NOT_FOUND: 'Preferences not found. Create them with POST /api/v1/preferences first.',
  ALREADY_EXISTS: 'You already have preferences. Use PUT /api/v1/preferences to update them.',
});

// API field → preferences column (the only columns this API writes).
const COLUMNS = Object.freeze({
  preferredLocation: 'preferred_location',
  preferredEducation: 'preferred_education',
  preferredOccupation: 'preferred_occupation',
  preferredLifestyle: 'lifestyle_preference',
  preferredFood: 'food_preference',
  partnerMinAge: 'partner_min_age',
  partnerMaxAge: 'partner_max_age',
});

const toColumns = (data) =>
  Object.fromEntries(
    Object.entries(COLUMNS)
      .filter(([field]) => data[field] !== undefined)
      .map(([field, column]) => [column, data[field]])
  );

/** Other partner preferences kept in the partner_preferences JSON column. */
function mergePartnerPreferences(current, data) {
  if (data.preferredGenders === undefined) return undefined;
  const next = { ...(current || {}) };
  if (data.preferredGenders === null || data.preferredGenders.length === 0) delete next.genders;
  else next.genders = data.preferredGenders;
  return JSON.stringify(next);
}

function toResponse(row, hobbies, quizAnswers) {
  return {
    isSet: Boolean(row),
    preferredLocation: row?.preferred_location ?? null,
    preferredEducation: row?.preferred_education ?? null,
    preferredOccupation: row?.preferred_occupation ?? null,
    preferredLifestyle: row?.lifestyle_preference ?? null,
    preferredFood: row?.food_preference ?? null,
    partnerMinAge: row?.partner_min_age ?? null,
    partnerMaxAge: row?.partner_max_age ?? null,
    preferredGenders: row?.partner_preferences?.genders ?? [],
    hobbies,
    quizAnswers,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

async function load(userId, trx) {
  const row = await Preference.findByPk(userId, trx);
  const [hobbies, quizAnswers] = await Promise.all([
    hobbyService.getUserHobbies(userId, trx),
    quizService.getAnswers(userId, trx),
  ]);
  return toResponse(row, hobbies, quizAnswers);
}

/** Preferences + selected hobbies + quiz answers. Works before anything is saved (isSet: false). */
async function getPreferences(userId) {
  return load(userId);
}

/** Writes the related hobby and quiz data inside the same transaction. */
async function writeRelated(userId, data, trx) {
  if (data.hobbyIds !== undefined) await hobbyService.setUserHobbies(userId, data.hobbyIds, trx);
  if (data.quizAnswers !== undefined) {
    await quizService.saveAnswers(userId, data.quizAnswers, trx, { fieldPrefix: 'body.quizAnswers' });
  }
}

async function createPreferences(userId, data) {
  if (await Preference.findByPk(userId)) throw ApiError.conflict(MESSAGES.ALREADY_EXISTS);

  await getDb().transaction(async (trx) => {
    await Preference.query(trx).insert({
      user_id: userId,
      ...toColumns(data),
      ...(data.preferredGenders !== undefined && { partner_preferences: mergePartnerPreferences(null, data) }),
    });
    await writeRelated(userId, data, trx);
  });
  return load(userId);
}

async function updatePreferences(userId, data) {
  await getDb().transaction(async (trx) => {
    const row = await Preference.findByPk(userId, trx);
    if (!row) throw ApiError.notFound(MESSAGES.NOT_FOUND);

    // The age range must stay valid after merging with stored values.
    const min = data.partnerMinAge !== undefined ? data.partnerMinAge : row.partner_min_age;
    const max = data.partnerMaxAge !== undefined ? data.partnerMaxAge : row.partner_max_age;
    if (min != null && max != null && min > max) {
      throw ApiError.validation([
        { field: 'body.partnerMinAge', message: 'Minimum partner age cannot be greater than the maximum' },
      ]);
    }

    const changes = toColumns(data);
    const partnerPreferences = mergePartnerPreferences(row.partner_preferences, data);
    if (partnerPreferences !== undefined) changes.partner_preferences = partnerPreferences;
    if (Object.keys(changes).length > 0) {
      await Preference.query(trx).where({ user_id: userId }).update(changes);
    }
    await writeRelated(userId, data, trx);
  });
  return load(userId);
}

/** Choices the UI offers, from the same source the validator uses. */
function getOptions() {
  const toOptions = (pairs) => pairs.map(([value, label]) => ({ value, label }));
  return {
    foodPreferences: toOptions(FOOD_PREFERENCES),
    partnerGenders: toOptions(PARTNER_GENDERS),
    partnerAge: { ...PARTNER_AGE },
    maxHobbies: MAX_HOBBIES,
    maxLengths: {
      preferredLocation: 150,
      preferredEducation: 150,
      preferredOccupation: 150,
      preferredLifestyle: 100,
    },
  };
}

module.exports = { getPreferences, createPreferences, updatePreferences, getOptions, MESSAGES };
