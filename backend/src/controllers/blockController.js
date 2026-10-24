/**
 * Blocking endpoints. HTTP only — rules live in services/blockService.js.
 * The blocker is always req.auth.userId.
 */
const blockService = require('../services/blockService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

async function listBlocks(req, res) {
  const blocks = await blockService.listBlocks(req.auth.userId);
  sendSuccess(res, { data: { blocks } });
}

async function blockUser(req, res) {
  const block = await blockService.blockUser(req.auth.userId, req.validated.body.userId, req.validated.body.reason);
  if (block.created) sendCreated(res, { message: 'User blocked.', data: { block } });
  else sendSuccess(res, { message: 'User is already blocked.', data: { block } });
}

async function unblockUser(req, res) {
  const block = await blockService.unblockUser(req.auth.userId, req.validated.params.userId);
  sendSuccess(res, { message: 'User unblocked.', data: { block } });
}

module.exports = { listBlocks, blockUser, unblockUser };
