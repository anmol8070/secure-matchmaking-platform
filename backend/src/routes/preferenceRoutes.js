/**
 * /api/v1/preferences — the authenticated user's matching preferences,
 * hobby selection and quiz answers. Mounted behind requireAuth in routes.js:
 *   route → requireAuth → validation → controller → service → DB
 */
const { Router } = require('express');
const preferences = require('../controllers/preferenceController');
const { validate } = require('../validators/commonValidator');
const schemas = require('../validators/preferenceValidator');

const router = Router();

// Preferences (optionally with hobbyIds and quizAnswers, saved in one transaction)
router.get('/', preferences.getPreferences);
router.post('/', validate({ body: schemas.createPreferencesBody }), preferences.createPreferences);
router.put('/', validate({ body: schemas.updatePreferencesBody }), preferences.updatePreferences);
router.get('/options', preferences.getOptions);

// Hobby selection
router.put('/hobbies', validate({ body: schemas.setHobbiesBody }), preferences.setHobbies);
router.delete('/hobbies/:hobbyId', validate({ params: schemas.hobbyIdParams }), preferences.removeHobby);

// Compatibility quiz
router.get('/quiz', preferences.getQuiz);
router.put('/quiz', validate({ body: schemas.saveQuizBody }), preferences.saveQuiz);

module.exports = router;
