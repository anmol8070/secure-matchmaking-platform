/**
 * Phase 7 Connection Request & Relationship Service.
 *
 * Handles sending, listing, accepting, and rejecting connection requests.
 * Integrates with blockService to prevent blocked connections and feedbackService
 * to record user interactions for adaptive ranking.
 */

const { ConnectionRequest, Profile, Block } = require('../models');
const feedbackService = require('./feedbackService');
const ApiError = require('../utils/ApiError');

async function sendRequest(senderId, receiverId, trx) {
  if (Number(senderId) === Number(receiverId)) {
    throw ApiError.badRequest('Cannot send a connection request to yourself');
  }

  const receiverProfile = await Profile.findByPk(receiverId, trx);
  if (!receiverProfile) {
    throw ApiError.notFound('Target user profile not found');
  }

  const isBlocked = await Block.isBlocked(senderId, receiverId, trx);
  if (isBlocked) {
    throw ApiError.forbidden('Cannot connect with this user');
  }

  const requestId = await ConnectionRequest.sendRequest(senderId, receiverId, trx);

  // Log interaction for ML training pipeline
  await feedbackService.recordFeedback(
    senderId,
    { targetUserId: receiverId, action: 'connection_request' },
    trx
  );

  return {
    requestId,
    senderId,
    receiverId,
    status: 'pending',
  };
}

async function respondToRequest(userId, requestId, status, trx) {
  if (!['accepted', 'rejected'].includes(status)) {
    throw ApiError.badRequest("Status must be 'accepted' or 'rejected'");
  }

  const request = await ConnectionRequest.findByPk(requestId, trx);
  if (!request) {
    throw ApiError.notFound('Connection request not found');
  }

  if (Number(request.receiver_id) !== Number(userId)) {
    throw ApiError.forbidden('You are not authorized to respond to this request');
  }

  const updated = await ConnectionRequest.updateStatus(requestId, status, trx);

  // Log interaction (accepted or rejected) for ML training pipeline
  await feedbackService.recordFeedback(
    userId,
    { targetUserId: request.sender_id, action: status },
    trx
  );

  return updated;
}

async function listRequests(userId, status = null, trx) {
  return ConnectionRequest.listForUser(userId, status, trx);
}

async function listConnections(userId, trx) {
  const requests = await ConnectionRequest.listForUser(userId, 'accepted', trx);
  return requests.map((req) => {
    const isSender = Number(req.sender_id) === Number(userId);
    return {
      requestId: req.request_id,
      connectedUserId: isSender ? req.receiver_id : req.sender_id,
      acceptedAt: req.updated_at,
    };
  });
}

module.exports = {
  sendRequest,
  respondToRequest,
  listRequests,
  listConnections,
};
