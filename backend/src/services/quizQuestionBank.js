/**
 * Compatibility quiz question source.
 *
 * Questions are loaded from a JSON file (QUIZ_QUESTIONS_FILE, default
 * src/config/quiz-questions.json) and validated at startup, so the
 * questionnaire can change without code changes. Answers are stored in
 * quiz_answers keyed by the question's stable string id.
 *
 * Question types:
 *   single_choice    answer = one option value              (stored as the value)
 *   multiple_choice  answer = array of option values        (stored as a JSON array)
 *   text             answer = free text up to maxLength     (stored as text)
 */
const fs = require('fs');
const { z } = require('zod');
const config = require('../config/environment');

const ID = /^[a-z0-9_]{1,64}$/;

const option = z.object({ value: z.string().regex(ID), label: z.string().min(1).max(120) });

const question = z.discriminatedUnion('type', [
  z.object({ id: z.string().regex(ID), text: z.string().min(1).max(300), type: z.literal('single_choice'), options: z.array(option).min(2).max(20) }),
  z.object({
    id: z.string().regex(ID),
    text: z.string().min(1).max(300),
    type: z.literal('multiple_choice'),
    options: z.array(option).min(2).max(20),
    maxSelections: z.number().int().min(1).max(20).optional(),
  }),
  z.object({ id: z.string().regex(ID), text: z.string().min(1).max(300), type: z.literal('text'), maxLength: z.number().int().min(1).max(1000).default(500) }),
]);

const bankSchema = z
  .object({
    version: z.string().min(1).max(40),
    status: z.enum(['sample', 'draft', 'approved']),
    description: z.string().max(1000).optional(),
    questions: z.array(question).max(100),
  })
  .superRefine((bank, ctx) => {
    const ids = new Set();
    bank.questions.forEach((q, i) => {
      if (ids.has(q.id)) ctx.addIssue({ code: 'custom', path: ['questions', i, 'id'], message: `Duplicate question id "${q.id}"` });
      ids.add(q.id);
      if (q.options && new Set(q.options.map((o) => o.value)).size !== q.options.length) {
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'options'], message: 'Duplicate option values' });
      }
    });
  });

let cached = null;

/** Loads and validates the question bank (throws with a clear message if invalid). */
function loadQuestionBank(file = config.quiz.questionsFile) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read quiz questions from ${file}: ${err.message}`);
  }
  const result = bankSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid quiz questions file ${file}: ${issue.path.join('.')} ${issue.message}`);
  }
  return result.data;
}

function getQuestionBank() {
  cached ||= loadQuestionBank();
  return cached;
}

function findQuestion(id) {
  return getQuestionBank().questions.find((q) => q.id === id) || null;
}

/** Public form of the questions (what the frontend needs to render them). */
function publicQuestions() {
  const { version, status, questions } = getQuestionBank();
  return { version, status, questions };
}

module.exports = { loadQuestionBank, getQuestionBank, findQuestion, publicQuestions };
