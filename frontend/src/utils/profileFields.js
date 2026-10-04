/**
 * Profile form rules shared by create and edit. They mirror the backend
 * validator for quick feedback; the backend remains the authority.
 */
export const GENDER_OPTIONS = [
  ['', 'Prefer not to choose'],
  ['female', 'Female'],
  ['male', 'Male'],
  ['non_binary', 'Non-binary'],
  ['other', 'Other'],
  ['prefer_not_to_say', 'Prefer not to say'],
];

export const MIN_AGE = 18;
export const MAX_AGE = 100;
export const BIO_MAX = 2000;

export const EMPTY_PROFILE = {
  name: '',
  dateOfBirth: '',
  gender: '',
  city: '',
  state: '',
  country: '',
  education: '',
  occupation: '',
  lifestyle: '',
  bio: '',
};

const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const NO_ANGLE_BRACKETS = /^[^<>]*$/;

export function ageFrom(dateOfBirth, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth || '');
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const before = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  return today.getFullYear() - y - (before ? 1 : 0);
}

/** Latest date of birth allowed by the minimum age, as YYYY-MM-DD (for the date picker). */
export function latestBirthDate(today = new Date()) {
  const d = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  return d.toISOString().slice(0, 10);
}

export function validateProfile(values) {
  const errors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Name is required';
  else if (name.length < 2) errors.name = 'Name must be at least 2 characters';
  else if (name.length > 100) errors.name = 'Name must be at most 100 characters';
  else if (!NAME_PATTERN.test(name)) errors.name = 'Name can contain letters, spaces, apostrophes, dots and hyphens';

  if (!values.dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
  else {
    const age = ageFrom(values.dateOfBirth);
    if (age === null) errors.dateOfBirth = 'Enter a valid date of birth';
    else if (age < MIN_AGE) errors.dateOfBirth = `You must be at least ${MIN_AGE} years old`;
    else if (age > MAX_AGE) errors.dateOfBirth = `Age must be ${MAX_AGE} or less`;
  }

  for (const [field, label] of [
    ['city', 'City'],
    ['state', 'State'],
    ['country', 'Country'],
  ]) {
    const value = values[field].trim();
    if (value.length > 100) errors[field] = `${label} must be at most 100 characters`;
    else if (value && !NAME_PATTERN.test(value)) errors[field] = `${label} can contain letters, spaces, apostrophes, dots and hyphens`;
  }

  for (const [field, label, max] of [
    ['education', 'Education', 150],
    ['occupation', 'Occupation', 150],
    ['lifestyle', 'Lifestyle', 100],
  ]) {
    const value = values[field].trim();
    if (value.length > max) errors[field] = `${label} must be at most ${max} characters`;
    else if (!NO_ANGLE_BRACKETS.test(value)) errors[field] = `${label} contains characters that are not allowed (< or >)`;
  }

  if (values.bio.trim().length > BIO_MAX) errors.bio = `Bio must be at most ${BIO_MAX} characters`;
  return errors;
}

/** Form values → API body (empty optional fields are sent as null to clear them). */
export function toProfileBody(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const trimmed = typeof value === 'string' ? value.trim() : value;
      return [key, trimmed === '' && key !== 'name' && key !== 'dateOfBirth' ? null : trimmed];
    })
  );
}

/** API profile → form values. */
export function toFormValues(profile) {
  return Object.fromEntries(Object.keys(EMPTY_PROFILE).map((key) => [key, profile?.[key] ?? '']));
}
