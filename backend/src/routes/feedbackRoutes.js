/**
 * /api/v1/feedback — activity and interaction feedback for adaptive recommendation.
 */
const { Router } = require('express');
const feedback = require('../controllers/feedbackController');
const { validate, z, id, paginationQuery } = require('../validators/commonValidator');

const router = Router();

const recordFeedbackBody = z.object({
  targetUserId: id().optional().nullable(),
  action: z.enum(['profile_view', 'like', 'connection_request', 'accepted', 'rejected', 'feedback']),
  reason: z.string().trim().max(500).optional().nullable(),
});

router.post('/', validate({ body: recordFeedbackBody }), feedback.recordFeedback);
router.get('/', validate({ query: paginationQuery }), feedback.listOwnActivity);

module.exports = router;
