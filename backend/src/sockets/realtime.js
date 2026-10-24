/**
 * Access to the running Socket.IO server for other modules (e.g. logout),
 * without making them depend on Socket.IO. Every function is a safe no-op
 * when no socket server is attached (unit tests, scripts).
 */
let io = null;

const rooms = Object.freeze({
  user: (userId) => `user:${Number(userId)}`,
  session: (sessionId) => `session:${sessionId}`,
  conversation: (conversationId) => `conversation:${Number(conversationId)}`,
});

function setServer(server) {
  io = server;
}

function getServer() {
  return io;
}

/** Disconnects every socket opened with this session (logout / revocation). */
function disconnectSession(sessionId) {
  if (io && sessionId) io.in(rooms.session(sessionId)).disconnectSockets(true);
}

/** Disconnects every socket of a user (e.g. account suspended). */
function disconnectUser(userId) {
  if (io && userId) io.in(rooms.user(userId)).disconnectSockets(true);
}

module.exports = { rooms, setServer, getServer, disconnectSession, disconnectUser };
