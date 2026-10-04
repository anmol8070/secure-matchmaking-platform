/**
 * Matching engine — later phase.
 *
 * Calculates compatibility scores and per-attribute breakdowns (location,
 * education, occupation, hobbies, lifestyle, food) and stores them in
 * `matches`. All scoring lives here on the server: the React frontend only
 * displays results, so the algorithm can change without touching the UI.
 * Nothing is hard-coded; there are no default or fake scores.
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService(['calculateCompatibility', 'getMatches', 'getMatchWithUser']);
