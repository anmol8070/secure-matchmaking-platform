/**
 * /api/v1/feedback — activity and interaction feedback for adaptive recommendation.
 *
 * Accepted action values match the DB `chk_activity_feedback_action` constraint
 * plus legacy aliases (like → interest, accepted → connection_accepted, etc.).
 * The service layer translates aliases to canonical DB values before inserting.
 */
const { Router } = require('express');
const feedback = require('../controllers/feedbackController');
const { validate, z, id, paginationQuery } = require('../validators/commonValidator');

const router = Router();

const recordFeedbackBody = z.object({
  targetUserId: id().optional().nullable(),
  // DB canonical values + API aliases (service maps aliases → DB values)
  action: z.enum([
    'profile_view',
    'interest',
    'like',              // alias → interest
    'connection_request',
    'connection_accepted',
    'accepted',          // alias → connection_accepted
    'rejection',
    'rejected',          // alias → rejection
    'feedback',
  ]),
  reason: z.string().trim().max(500).optional().nullable(),
});

router.post('/', validate({ body: recordFeedbackBody }), feedback.recordFeedback);
router.get('/', validate({ query: paginationQuery }), feedback.listOwnActivity);

module.exports = router;
