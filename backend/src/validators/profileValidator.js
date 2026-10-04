/**
 * Request schemas for /api/v1/profile.
 *
 * - Every text field is sanitised: Unicode NFC, control characters removed,
 *   whitespace normalised. Single-line fields reject "<" and ">".
 * - Schemas are strict: user_id, role, status, password, email… are rejected
 *   (422), so the profile API can never change account or security data.
 * - Optional fields accept null or "" to clear them.
 */
const { z, userIdParams } = require('./commonValidator');
const { ageFromDateOfBirth, isValidDate } = require('../utils/age');

const MIN_AGE = 18;
const MAX_AGE = 100;
const GENDERS = ['male', 'female', 'non_binary', 'other', 'prefer_not_to_say'];

// Letters (any script) with spaces, apostrophes, dots and hyphens — names and places.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const CONTROL_SINGLE_LINE = /[\u0000-\u001F\u007F]/g;
const CONTROL_MULTI_LINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const cleanLine = (value) =>
  value.normalize('NFC').replace(CONTROL_SINGLE_LINE, ' ').replace(/\s+/g, ' ').trim();

const cleanText = (value) =>
  value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_MULTI_LINE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

function text(label, { max, min = 0, multiline = false, pattern, patternMessage } = {}) {
  return z
    .string({ error: (issue) => (issue.input === undefined ? `${label} is required` : `${label} must be text`) })
    .transform(multiline ? cleanText : cleanLine)
    .refine((v) => v.length >= min, `${label} must be at least ${min} characters`)
    .refine((v) => v.length <= max, `${label} must be at most ${max} characters`)
    .refine((v) => multiline || !/[<>]/.test(v), `${label} contains characters that are not allowed (< or >)`)
    .refine((v) => !pattern || v === '' || pattern.test(v), patternMessage || `${label} contains invalid characters`);
}

/** Optional + clearable: undefined = not provided, null/"" = clear. */
const clearable = (schema) =>
  schema
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const name = text('Name', {
  min: 2,
  max: 100,
  pattern: NAME_PATTERN,
  patternMessage: 'Name can contain letters, spaces, apostrophes, dots and hyphens',
});

const dateOfBirth = z
  .string({ error: 'Date of birth is required' })
  .trim()
  .refine(isValidDate, 'Enter a valid date of birth (YYYY-MM-DD)')
  .refine((v) => !isValidDate(v) || ageFromDateOfBirth(v) >= MIN_AGE, `You must be at least ${MIN_AGE} years old`)
  .refine((v) => !isValidDate(v) || ageFromDateOfBirth(v) <= MAX_AGE, `Age must be ${MAX_AGE} or less`);

const place = (label) =>
  text(label, { max: 100, pattern: NAME_PATTERN, patternMessage: `${label} can contain letters, spaces, apostrophes, dots and hyphens` });

const fields = {
  name,
  dateOfBirth,
  gender: clearable(z.enum(GENDERS, { error: `Gender must be one of: ${GENDERS.join(', ')}` })),
  city: clearable(place('City')),
  state: clearable(place('State')),
  country: clearable(place('Country')),
  education: clearable(text('Education', { max: 150 })),
  occupation: clearable(text('Occupation', { max: 150 })),
  lifestyle: clearable(text('Lifestyle', { max: 100 })),
  bio: clearable(text('Bio', { max: 2000, multiline: true })),
};

/** POST /profile — name and date of birth are required. */
const createProfileBody = z.object(fields).strict();

/** PUT /profile — any subset of fields; provided fields are updated. */
const updateProfileBody = z
  .object({ ...fields, name: name.optional(), dateOfBirth: dateOfBirth.optional() })
  .strict()
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: 'Provide at least one profile field to update',
  });

module.exports = {
  createProfileBody,
  updateProfileBody,
  userIdParams,
  GENDERS,
  MIN_AGE,
  MAX_AGE,
};
