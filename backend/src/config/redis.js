/**
 * Optional shared Redis connection (REDIS_URL).
 *
 * Without REDIS_URL the API runs as a single instance: Socket.IO uses its
 * in-memory adapter and the message rate limit is kept in memory. With it,
 * both are shared, so several instances behave as one.
 *
 * Only this module creates Redis connections (like config/database.js for SQL).
 */
const config = require('./environment');
const logger = require('../utils/logger');

let client = null;
let connecting = null;

const isEnabled = () => Boolean(config.redis.url);

/** A new, not yet connected client (errors are logged without the URL/credentials). */
function createRedisClient() {
  const { createClient } = require('redis');
  const redis = createClient({ url: config.redis.url });
  redis.on('error', (err) => logger.error('Redis connection error', { code: err.code || err.name }));
  return redis;
}

/** The shared command client, or null when Redis is not configured. */
async function getRedis() {
  if (!isEnabled()) return null;
  if (client?.isReady) return client;
  if (!connecting) {
    const redis = createRedisClient();
    connecting = redis
      .connect()
      .then(() => {
        client = redis;
        return redis;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}

module.exports = { isEnabled, getRedis, createRedisClient, closeRedis };
