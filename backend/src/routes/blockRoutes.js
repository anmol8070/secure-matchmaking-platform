/**
 * /api/v1/blocks — blocking and unblocking users.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const blocks = require('../controllers/blockController');
const { validate, userIdParams } = require('../validators/commonValidator');

const router = Router();

router.get('/', blocks.listBlocks);
router.post('/', blocks.blockUser);
router.delete('/:userId', validate({ params: userIdParams }), blocks.unblockUser);

module.exports = router;
