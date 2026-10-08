/**
 * Connection and connection request endpoints (connectionService).
 * HTTP only — logic lives in services/connectionService.js.
 */
const connectionService = require('../services/connectionService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

async function sendRequest(req, res) {
  const result = await connectionService.sendRequest(req.auth.userId, req.validated.body.receiverId);
  sendCreated(res, { message: 'Connection request sent successfully', data: result });
}

async function respondToRequest(req, res) {
  const result = await connectionService.respondToRequest(
    req.auth.userId,
    req.validated.params.requestId,
    req.validated.body.status
  );
  sendSuccess(res, { message: `Connection request ${req.validated.body.status}`, data: result });
}

async function listRequests(req, res) {
  const status = req.validated.query?.status || null;
  const result = await connectionService.listRequests(req.auth.userId, status);
  sendSuccess(res, { data: { requests: result } });
}

async function listConnections(req, res) {
  const result = await connectionService.listConnections(req.auth.userId);
  sendSuccess(res, { data: { connections: result } });
}

module.exports = {
  sendRequest,
  respondToRequest,
  listRequests,
  listConnections,
};
