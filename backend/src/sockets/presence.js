/**
 * Online presence from Socket.IO connection state.
 *
 * A user is online while at least one socket is in their user:<id> room, so
 * several tabs/devices never overwrite each other. The lookup goes through
 * the Socket.IO adapter (fetchSockets), so with the Redis adapter it covers
 * every API instance, not only this process.
 *
 * Presence is separate from message status: "online" never means "delivered".
 */
const { rooms } = require('./realtime');

/** Number of connected sockets the user has (all instances). */
async function socketCount(io, userId) {
  const sockets = await io.in(rooms.user(userId)).fetchSockets();
  return sockets.length;
}

async function isOnline(io, userId) {
  return (await socketCount(io, userId)) > 0;
}

module.exports = { socketCount, isOnline };
