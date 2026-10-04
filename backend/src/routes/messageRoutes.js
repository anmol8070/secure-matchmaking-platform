/**
 * /api/v1/messages — private conversations (real-time delivery added later).
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const messages = require('../controllers/messageController');
const { validate, userIdParams } = require('../validators/commonValidator');

const router = Router();

router.get('/conversations', messages.listConversations);
router.get('/:userId', validate({ params: userIdParams }), messages.getConversation);
router.post('/:userId', validate({ params: userIdParams }), messages.sendMessage);
router.patch('/:userId/read', validate({ params: userIdParams }), messages.markConversationRead);

module.exports = router;
