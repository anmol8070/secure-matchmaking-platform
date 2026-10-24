/**
 * /api/v1/messages — private chat between accepted connections (Phase 11).
 * Protected by requireAuth (routes.js). Real-time delivery: src/sockets.
 */
const { Router } = require('express');
const messages = require('../controllers/messageController');
const { validate, userIdParams } = require('../validators/commonValidator');
const { sendMessageBody, imageMessageBody, historyQuery, messageIdParams } = require('../validators/messageValidator');
const { uploadChatImage } = require('../middleware/uploadMiddleware');

const router = Router();

router.get('/conversations', messages.listConversations);
router.post('/', validate({ body: sendMessageBody }), messages.sendMessage);
// multipart/form-data: image (file), receiverId, caption (optional)
router.post('/images', uploadChatImage, validate({ body: imageMessageBody }), messages.sendImageMessage);
router.get('/:id/image', validate({ params: messageIdParams }), messages.getMessageImage);
router.get('/:userId', validate({ params: userIdParams, query: historyQuery }), messages.getConversation);
router.put('/:id/read', validate({ params: messageIdParams }), messages.markMessageRead);

module.exports = router;
