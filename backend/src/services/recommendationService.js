/**
 * Recommendation and adaptive recommendation — later phase.
 *
 * Ranks candidates using matchingService scores, excludes blocked users, and
 * adapts per-user weights from activity_feedback. Kept separate from
 * matchingService (scoring) and from the frontend (display only).
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService(['getRecommendations', 'recalculateWeights']);
