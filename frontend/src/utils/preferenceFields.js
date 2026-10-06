/**
 * Preference form helpers. Option lists and limits come from the backend
 * (GET /preferences/options); these checks are for quick feedback only —
 * the API validates everything again.
 */
export const TEXT_FIELDS = [
  ['preferredLocation', 'Preferred location', 'e.g. Kolhapur, Maharashtra'],
  ['preferredEducation', 'Preferred education', 'e.g. Postgraduate'],
  ['preferredOccupation', 'Preferred occupation', 'e.g. Software Developer'],
  ['preferredLifestyle', 'Preferred lifestyle', 'e.g. Active, non-smoker'],
];

const PLACE_LIST = /^[\p{L}\p{M}][\p{L}\p{M}' .,-]*$/u;

export const EMPTY_PREFERENCES = {
  preferredLocation: '',
  preferredEducation: '',
  preferredOccupation: '',
  preferredLifestyle: '',
  preferredFood: '',
  partnerMinAge: '',
  partnerMaxAge: '',
  preferredGenders: [],
};

/** API data → form values. */
export function toPreferenceValues(data) {
  return Object.fromEntries(
    Object.keys(EMPTY_PREFERENCES).map((key) => {
      const value = data?.[key];
      if (key === 'preferredGenders') return [key, value || []];
      return [key, value === null || value === undefined ? '' : String(value)];
    })
  );
}

/** Form values → API body (empty fields are sent as null to clear them). */
export function toPreferenceBody(values) {
  const body = {};
  for (const [key] of TEXT_FIELDS) body[key] = values[key].trim() || null;
  body.preferredFood = values.preferredFood || null;
  body.partnerMinAge = values.partnerMinAge === '' ? null : Number(values.partnerMinAge);
  body.partnerMaxAge = values.partnerMaxAge === '' ? null : Number(values.partnerMaxAge);
  body.preferredGenders = values.preferredGenders;
  return body;
}

export function validatePreferences(values, options) {
  const errors = {};
  const maxLengths = options?.maxLengths || {};
  for (const [key, label] of TEXT_FIELDS) {
    const value = values[key].trim();
    if (maxLengths[key] && value.length > maxLengths[key]) errors[key] = `${label} must be at most ${maxLengths[key]} characters`;
    else if (/[<>]/.test(value)) errors[key] = `${label} contains characters that are not allowed (< or >)`;
  }
  if (!errors.preferredLocation && values.preferredLocation.trim() && !PLACE_LIST.test(values.preferredLocation.trim())) {
    errors.preferredLocation = 'Use letters, spaces, commas, apostrophes, dots and hyphens';
  }

  const { min, max } = options?.partnerAge || { min: 18, max: 100 };
  const ages = {};
  for (const [key, label] of [
    ['partnerMinAge', 'Minimum age'],
    ['partnerMaxAge', 'Maximum age'],
  ]) {
    if (values[key] === '') continue;
    const n = Number(values[key]);
    if (!Number.isInteger(n)) errors[key] = `${label} must be a whole number`;
    else if (n < min || n > max) errors[key] = `${label} must be between ${min} and ${max}`;
    else ages[key] = n;
  }
  if (ages.partnerMinAge !== undefined && ages.partnerMaxAge !== undefined && ages.partnerMinAge > ages.partnerMaxAge) {
    errors.partnerMinAge = 'Minimum age cannot be greater than the maximum';
  }
  return errors;
}

/* ---------------- quiz ---------------- */

const isEmptyAnswer = (answer) => answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0);

/** [{ questionId, answer }] → { questionId: answer } */
export const answersToMap = (answers = []) => Object.fromEntries(answers.map((a) => [a.questionId, a.answer]));

/**
 * Current answers → request list. Questions answered before but now empty are
 * sent as null (removes the saved answer); untouched empty ones are omitted.
 */
export function toQuizAnswers(questions, answers, savedIds = new Set()) {
  return questions
    .filter((q) => !isEmptyAnswer(answers[q.id]) || savedIds.has(q.id))
    .map((q) => ({ questionId: q.id, answer: isEmptyAnswer(answers[q.id]) ? null : answers[q.id] }));
}

export function validateQuiz(questions, answers) {
  const errors = {};
  for (const q of questions) {
    const answer = answers[q.id];
    if (q.type === 'text' && typeof answer === 'string' && answer.trim().length > q.maxLength) {
      errors[q.id] = `Answer must be at most ${q.maxLength} characters`;
    }
    if (q.type === 'multiple_choice' && q.maxSelections && Array.isArray(answer) && answer.length > q.maxSelections) {
      errors[q.id] = `Choose at most ${q.maxSelections} options`;
    }
  }
  return errors;
}

/** Server errors "body.quizAnswers.2.answer" → { [questionId]: message } using the sent list. */
export function quizErrorsFromServer(err, sent, prefix) {
  const result = {};
  for (const e of err?.body?.errors || []) {
    const match = new RegExp(`^body\\.${prefix}\\.(\\d+)\\.`).exec(e.field);
    if (match && sent[Number(match[1])]) result[sent[Number(match[1])].questionId] = e.message;
  }
  return result;
}
