/**
 * Private messaging between connected users — later phase.
 * Real-time delivery (Socket.IO) and video calling (WebRTC signalling) will
 * build on this service; message text must never be logged.
 */
const { placeholderService } = require('../utils/notImplemented');

module.exports = placeholderService([
  'listConversations',
  'getConversation',
  'sendMessage',
  'markConversationRead',
]);
