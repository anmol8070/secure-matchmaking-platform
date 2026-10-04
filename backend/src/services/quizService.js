/**
 * Quiz answers (quiz_answers): one answer per user per question.
 *
 * Answers are checked against the configured question bank
 * (quizQuestionBank). Scoring answers for compatibility is NOT done here —
 * that belongs to the matching engine (later phase).
 */
const { getDb } = require('../config/database');
const QuizAnswer = require('../models/quizAnswerModel');
const ApiError = require('../utils/ApiError');
const { cleanText } = require('../validators/textFields');
const questionBank = require('./quizQuestionBank');

/** Checks answers against their questions; returns normalised answers or throws 422. */
function normaliseAnswers(answers, fieldPrefix = 'body.answers') {
  const errors = [];
  const normalised = answers.map(({ questionId, answer }, i) => {
    const field = `${fieldPrefix}.${i}`;
    const question = questionBank.findQuestion(questionId);
    if (!question) {
      errors.push({ field: `${field}.questionId`, message: `Unknown question: ${questionId}` });
      return null;
    }
    if (answer === null) return { questionId, answer: null }; // remove the answer

    const options = new Set((question.options || []).map((o) => o.value));
    if (question.type === 'single_choice') {
      if (typeof answer !== 'string' || !options.has(answer)) {
        errors.push({ field: `${field}.answer`, message: 'Choose one of the listed options' });
      }
      return { questionId, answer };
    }
    if (question.type === 'multiple_choice') {
      if (!Array.isArray(answer) || answer.length === 0) {
        errors.push({ field: `${field}.answer`, message: 'Choose at least one option' });
      } else if (new Set(answer).size !== answer.length) {
        errors.push({ field: `${field}.answer`, message: 'Options must not repeat' });
      } else if (answer.some((value) => !options.has(value))) {
        errors.push({ field: `${field}.answer`, message: 'Choose only from the listed options' });
      } else if (question.maxSelections && answer.length > question.maxSelections) {
        errors.push({ field: `${field}.answer`, message: `Choose at most ${question.maxSelections} options` });
      }
      return { questionId, answer };
    }
    // text
    const value = typeof answer === 'string' ? cleanText(answer) : null;
    if (value === null) errors.push({ field: `${field}.answer`, message: 'Answer must be text' });
    else if (value.length === 0) errors.push({ field: `${field}.answer`, message: 'Answer must not be empty (use null to remove it)' });
    else if (value.length > question.maxLength) {
      errors.push({ field: `${field}.answer`, message: `Answer must be at most ${question.maxLength} characters` });
    }
    return { questionId, answer: value };
  });

  if (errors.length > 0) throw ApiError.validation(errors);
  return normalised;
}

const serialise = (question, answer) => (question.type === 'multiple_choice' ? JSON.stringify(answer) : answer);

function deserialise(question, stored) {
  if (question.type !== 'multiple_choice') return stored;
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/** The user's answers to questions that are in the current question bank, in question order. */
async function getAnswers(userId, trx) {
  const rows = await QuizAnswer.query(trx).where({ user_id: userId }).select('question_id', 'answer');
  const byId = new Map(rows.map((r) => [r.question_id, r.answer]));
  return questionBank
    .getQuestionBank()
    .questions.filter((q) => byId.has(q.id))
    .map((q) => ({ questionId: q.id, answer: deserialise(q, byId.get(q.id)) }));
}

/**
 * Validates and saves answers (upsert per question; null deletes). Only the
 * given questions change. Must run in the caller's transaction when combined
 * with other writes.
 */
async function saveAnswers(userId, answers, trx, { fieldPrefix } = {}) {
  const normalised = normaliseAnswers(answers, fieldPrefix);
  for (const { questionId, answer } of normalised) {
    if (answer === null) {
      await QuizAnswer.query(trx).where({ user_id: userId, question_id: questionId }).del();
    } else {
      await QuizAnswer.query(trx)
        .insert({ user_id: userId, question_id: questionId, answer: serialise(questionBank.findQuestion(questionId), answer) })
        .onConflict(['user_id', 'question_id'])
        .merge(['answer']);
    }
  }
}

async function getQuiz(userId) {
  return { questionnaire: questionBank.publicQuestions(), answers: await getAnswers(userId) };
}

/** Standalone save (own transaction): all answers are saved, or none. */
async function saveQuiz(userId, answers) {
  await getDb().transaction((trx) => module.exports.saveAnswers(userId, answers, trx));
  return getQuiz(userId);
}

module.exports = { getQuiz, saveQuiz, getAnswers, saveAnswers, normaliseAnswers };
