/**
 * Video call endpoints (Phase 12). HTTP only — rules live in
 * services/callService.js. The acting user is always req.auth.userId.
 * Signalling (offer/answer/ICE) is Socket.IO only: see src/sockets/callSocket.js.
 */
const callService = require('../services/callService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

async function getIceServers(req, res) {
  // Short-lived TURN credentials may be included: never cache, never log.
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, { data: callService.getIceServers(req.auth.userId) });
}

async function getHistory(req, res) {
  sendSuccess(res, { data: await callService.getHistory(req.auth.userId, req.validated.query) });
}

async function initiateCall(req, res) {
  const { call, busy } = await callService.initiateCall(req.auth.userId, req.validated.body.receiverId);
  sendCreated(res, { message: busy ? 'The user is busy on another call.' : 'Calling…', data: { call, busy } });
}

async function getCall(req, res) {
  sendSuccess(res, { data: { call: await callService.getCall(req.auth.userId, req.validated.params.id) } });
}

async function acceptCall(req, res) {
  const call = await callService.acceptCall(req.auth.userId, req.validated.params.id);
  sendSuccess(res, { message: 'Call accepted.', data: { call } });
}

async function rejectCall(req, res) {
  const call = await callService.rejectCall(req.auth.userId, req.validated.params.id);
  sendSuccess(res, { message: 'Call rejected.', data: { call } });
}

async function endCall(req, res) {
  const call = await callService.endCall(req.auth.userId, req.validated.params.id);
  sendSuccess(res, { message: 'Call ended.', data: { call } });
}

module.exports = { getIceServers, getHistory, initiateCall, getCall, acceptCall, rejectCall, endCall };
