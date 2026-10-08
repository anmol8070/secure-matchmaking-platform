/**
 * Activity feedback endpoints (feedbackService).
 * HTTP only — logic lives in services/feedbackService.js.
 */
const feedbackService = require('../services/feedbackService');
const { sendCreated, sendSuccess } = require('../utils/apiResponse');

async function recordFeedback(req, res) {
  const result = await feedbackService.recordFeedback(req.auth.userId, req.validated.body);
  sendCreated(res, { message: 'Feedback recorded successfully', data: result });
}

async function listOwnActivity(req, res) {
  const result = await feedbackService.listOwnActivity(req.auth.userId, req.validated.query);
  sendSuccess(res, { data: result });
}

module.exports = {
  recordFeedback,
  listOwnActivity,
};
