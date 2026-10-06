/**
 * Request schemas for /api/v1/preferences (preferences, hobby selection, quiz).
 *
 * Strict schemas: unknown keys (user_id, userId, role…) are rejected with 422,
 * so a request can never target another user or change account data.
 * Optional fields accept null or "" to clear them.
 *
 * Hobby existence/active status and quiz answers against the question bank
 * are checked in the services (they need the database / question file).
 */
const { z, id } = require('./commonValidator');
const { PLACE_LIST_PATTERN, text, clearable } = require('./textFields');

const FOOD_PREFERENCES = Object.freeze([
  ['vegetarian', 'Vegetarian'],
  ['non_vegetarian', 'Non-vegetarian'],
  ['eggetarian', 'Eggetarian'],
  ['vegan', 'Vegan'],
  ['jain', 'Jain'],
  ['no_preference', 'No preference'],
]);
const PARTNER_GENDERS = Object.freeze([
  ['female', 'Female'],
  ['male', 'Male'],
  ['non_binary', 'Non-binary'],
  ['other', 'Other'],
]);
const PARTNER_AGE = Object.freeze({ min: 18, max: 100 });
const MAX_HOBBIES = 20;
const QUESTION_ID = /^[a-z0-9_]{1,64}$/;

const values = (pairs) => pairs.map(([value]) => value);
const unique = (list) => new Set(list).size === list.length;

const age = (label) =>
  z
    .number({ error: `${label} must be a whole number` })
    .int(`${label} must be a whole number`)
    .min(PARTNER_AGE.min, `${label} must be at least ${PARTNER_AGE.min}`)
    .max(PARTNER_AGE.max, `${label} must be at most ${PARTNER_AGE.max}`)
    .nullable()
    .optional();

const hobbyIds = z
  .array(id(), { error: 'hobbyIds must be a list of hobby ids' })
  .max(MAX_HOBBIES, `Select at most ${MAX_HOBBIES} hobbies`)
  .refine(unique, 'hobbyIds must not contain duplicates');

const quizAnswer = z
  .object({
    questionId: z.string({ error: 'questionId is required' }).regex(QUESTION_ID, 'Invalid questionId'),
    // Shape is checked against the question type in quizService; null removes the answer.
    answer: z.union([z.string().max(2000), z.array(z.string().max(64)).max(20), z.null()], {
      error: 'answer must be text, a list of options, or null',
    }),
  })
  .strict();

const quizAnswers = z
  .array(quizAnswer, { error: 'answers must be a list' })
  .max(100)
  .refine((list) => unique(list.map((a) => a.questionId)), 'Each question can be answered only once');

const fields = {
  preferredLocation: clearable(
    text('Preferred location', {
      max: 150,
      pattern: PLACE_LIST_PATTERN,
      patternMessage: 'Preferred location can contain letters, spaces, commas, apostrophes, dots and hyphens',
    })
  ),
  preferredEducation: clearable(text('Preferred education', { max: 150 })),
  preferredOccupation: clearable(text('Preferred occupation', { max: 150 })),
  preferredLifestyle: clearable(text('Preferred lifestyle', { max: 100 })),
  preferredFood: clearable(z.enum(values(FOOD_PREFERENCES), { error: `preferredFood must be one of: ${values(FOOD_PREFERENCES).join(', ')}` })),
  partnerMinAge: age('Minimum partner age'),
  partnerMaxAge: age('Maximum partner age'),
  preferredGenders: z
    .array(z.enum(values(PARTNER_GENDERS), { error: `Genders must be from: ${values(PARTNER_GENDERS).join(', ')}` }))
    .max(PARTNER_GENDERS.length)
    .refine(unique, 'preferredGenders must not contain duplicates')
    .nullable()
    .optional(),
  // Optional: save hobbies and quiz answers in the same transaction.
  hobbyIds: hobbyIds.optional(),
  quizAnswers: quizAnswers.optional(),
};

function ageRange(value, ctx) {
  const { partnerMinAge: min, partnerMaxAge: max } = value;
  if (min != null && max != null && min > max) {
    ctx.addIssue({ code: 'custom', path: ['partnerMinAge'], message: 'Minimum partner age cannot be greater than the maximum' });
  }
}

/** POST /preferences — every field optional (preferences can be partial). */
const createPreferencesBody = z.object(fields).strict().superRefine(ageRange);

/** PUT /preferences — any subset; only provided fields change. */
const updatePreferencesBody = z
  .object(fields)
  .strict()
  .superRefine(ageRange)
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one preference to update' });

/** PUT /preferences/hobbies — the complete new selection (replaces the old one). */
const setHobbiesBody = z.object({ hobbyIds }).strict();

/** PUT /preferences/quiz */
const saveQuizBody = z.object({ answers: quizAnswers }).strict();

const hobbyIdParams = z.object({ hobbyId: id() });

module.exports = {
  createPreferencesBody,
  updatePreferencesBody,
  setHobbiesBody,
  saveQuizBody,
  hobbyIdParams,
  FOOD_PREFERENCES,
  PARTNER_GENDERS,
  PARTNER_AGE,
  MAX_HOBBIES,
};
