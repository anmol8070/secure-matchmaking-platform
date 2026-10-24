/**
 * Private messaging endpoints (Phase 11).
 * HTTP only — rules live in services/messageService.js. The sender/reader is
 * always req.auth.userId; ids in the body never identify the acting user.
 */
const messageService = require('../services/messageService');
const { sendSuccess, sendCreated } = require('../utils/apiResponse');

async function listConversations(req, res) {
  const conversations = await messageService.listConversations(req.auth.userId);
  sendSuccess(res, { data: { conversations } });
}

async function getConversation(req, res) {
  const result = await messageService.getConversationMessages(req.auth.userId, req.validated.params.userId, req.validated.query);
  sendSuccess(res, { data: result });
}

async function sendMessage(req, res) {
  const message = await messageService.sendMessage(req.auth.userId, req.validated.body);
  sendCreated(res, { message: 'Message sent.', data: { message } });
}

async function sendImageMessage(req, res) {
  const message = await messageService.sendImageMessage(req.auth.userId, req.validated.body, req.file);
  sendCreated(res, { message: 'Image sent.', data: { message } });
}

/** Streams a chat image to one of the two participants (never cached publicly). */
async function getMessageImage(req, res) {
  const { buffer, contentType } = await messageService.getMessageImage(req.auth.userId, req.validated.params.id);
  res.set({
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': 'inline',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.status(200).end(buffer);
}

async function markMessageRead(req, res) {
  const read = await messageService.markMessageRead(req.auth.userId, req.validated.params.id);
  sendSuccess(res, { message: 'Message marked as read.', data: { read } });
}

module.exports = { listConversations, getConversation, sendMessage, sendImageMessage, getMessageImage, markMessageRead };
