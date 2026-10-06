/**
 * Preference, hobby-selection and quiz endpoints for the authenticated user.
 * HTTP only — rules live in the services. The user id comes from req.auth.
 */
const preferenceService = require('../services/preferenceService');
const hobbyService = require('../services/hobbyService');
const quizService = require('../services/quizService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

async function getPreferences(req, res) {
  sendSuccess(res, { data: await preferenceService.getPreferences(req.auth.userId) });
}

async function createPreferences(req, res) {
  const data = await preferenceService.createPreferences(req.auth.userId, req.validated.body);
  sendCreated(res, { message: 'Preferences saved successfully', data });
}

async function updatePreferences(req, res) {
  const data = await preferenceService.updatePreferences(req.auth.userId, req.validated.body);
  sendSuccess(res, { message: 'Preferences updated successfully', data });
}

function getOptions(req, res) {
  sendSuccess(res, { data: preferenceService.getOptions() });
}

async function setHobbies(req, res) {
  const hobbies = await hobbyService.replaceUserHobbies(req.auth.userId, req.validated.body.hobbyIds);
  sendSuccess(res, { message: 'Hobbies updated successfully', data: { hobbies } });
}

async function removeHobby(req, res) {
  const hobbies = await hobbyService.removeUserHobby(req.auth.userId, req.validated.params.hobbyId);
  sendSuccess(res, { message: 'Hobby removed', data: { hobbies } });
}

async function getQuiz(req, res) {
  sendSuccess(res, { data: await quizService.getQuiz(req.auth.userId) });
}

async function saveQuiz(req, res) {
  const data = await quizService.saveQuiz(req.auth.userId, req.validated.body.answers);
  sendSuccess(res, { message: 'Quiz answers saved successfully', data });
}

module.exports = {
  getPreferences,
  createPreferences,
  updatePreferences,
  getOptions,
  setHobbies,
  removeHobby,
  getQuiz,
  saveQuiz,
};
