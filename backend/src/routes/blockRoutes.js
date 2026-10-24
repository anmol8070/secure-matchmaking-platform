/**
 * /api/v1/blocks — blocking and unblocking users. Protected by requireAuth.
 */
const { Router } = require('express');
const blocks = require('../controllers/blockController');
const { validate, userIdParams, z, id } = require('../validators/commonValidator');

const router = Router();
const BLOCK_REASONS = ['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'threatening', 'other'];
// { blockedUserId } (preferred) or { userId } (Phase 11 clients). The blocker is always the token owner.
const blockBody = z
  .object({
    blockedUserId: id().optional(),
    userId: id().optional(),
    reason: z.enum(BLOCK_REASONS, { error: 'Choose a reason for the block' }).optional(),
  })
  .refine((b) => b.blockedUserId || b.userId, { message: 'blockedUserId is required', path: ['blockedUserId'] })
  .transform((b) => ({ userId: b.blockedUserId ?? b.userId, reason: b.reason || null }));

router.get('/', blocks.listBlocks);
router.post('/', validate({ body: blockBody }), blocks.blockUser);
router.delete('/:userId', validate({ params: userIdParams }), blocks.unblockUser);

module.exports = router;
