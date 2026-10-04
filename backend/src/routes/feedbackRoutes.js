/**
 * /api/v1/feedback — activity and feedback for adaptive recommendation.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const feedback = require('../controllers/feedbackController');

const router = Router();

router.post('/', feedback.recordFeedback);
router.get('/', feedback.listOwnActivity);

module.exports = router;
