/**
 * Connection request & connection management endpoints (Phase 10).
 * HTTP only — every business rule lives in services/connectionService.js.
 * The acting user is always req.auth.userId (from the access token).
 */
const connectionService = require('../services/connectionService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

const ACTION_MESSAGES = Object.freeze({
  accept: 'Connection request accepted.',
  reject: 'Connection request rejected.',
  cancel: 'Connection request cancelled.',
});

async function createConnectionRequest(req, res) {
  const connection = await connectionService.createConnectionRequest(req.auth.userId, req.validated.body.receiverId);
  sendCreated(res, { message: 'Connection request sent successfully.', data: { connection } });
}

async function updateConnectionRequest(req, res) {
  const { action } = req.validated.body;
  const connection = await connectionService.updateConnectionRequest(req.auth.userId, req.validated.params.id, action);
  sendSuccess(res, { message: ACTION_MESSAGES[action], data: { connection } });
}

async function removeConnection(req, res) {
  const connection = await connectionService.removeConnection(req.auth.userId, req.validated.params.id);
  sendSuccess(res, { message: 'Connection removed.', data: { connection } });
}

async function getReceivedRequests(req, res) {
  const requests = await connectionService.getReceivedRequests(req.auth.userId);
  sendSuccess(res, { data: { requests } });
}

async function getSentRequests(req, res) {
  const requests = await connectionService.getSentRequests(req.auth.userId);
  sendSuccess(res, { data: { requests } });
}

async function getMyConnections(req, res) {
  const connections = await connectionService.getMyConnections(req.auth.userId);
  sendSuccess(res, { data: { connections } });
}

async function getConnectionById(req, res) {
  const connection = await connectionService.getConnectionById(req.auth.userId, req.validated.params.id);
  sendSuccess(res, { data: { connection } });
}

async function getConnectionStatus(req, res) {
  const status = await connectionService.getConnectionStatus(req.auth.userId, req.validated.params.userId);
  sendSuccess(res, { data: status });
}

module.exports = {
  createConnectionRequest,
  updateConnectionRequest,
  removeConnection,
  getReceivedRequests,
  getSentRequests,
  getMyConnections,
  getConnectionById,
  getConnectionStatus,
};
