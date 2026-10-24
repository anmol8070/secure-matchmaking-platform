/**
 * Per-user fixed-window rate limits for chat and calls.
 *
 * Messages: REST (POST /messages, POST /messages/images) and Socket.IO
 * (message:send) all go through messageService, so they share one budget per
 * user: MESSAGE_RATE_LIMIT messages per MESSAGE_RATE_WINDOW_SECONDS.
 * Calls (callService) use createRateLimiter for call starts and signalling.
 *
 * Store: Redis when REDIS_URL is set (shared by every API instance),
 * otherwise in memory. If Redis is unreachable a limiter falls back to
 * memory for that call instead of blocking all communication.
 */
const config = require('../config/environment');
const redisConfig = require('../config/redis');
const logger = require('../utils/logger');

const limiters = [];

/**
 * @param {object} options
 * @param {string} options.name            Redis key prefix part, e.g. 'rate' or 'call-signal'
 * @param {() => number} options.limit     allowed hits per window (read on every call)
 * @param {() => number} options.windowMs  window length (read on every call)
 */
function createRateLimiter({ name, limit, windowMs }) {
  const windows = new Map(); // userId → { start, count }

  function consumeInMemory(userId, now = Date.now()) {
    const key = Number(userId);
    const current = windows.get(key);
    if (!current || now - current.start >= windowMs()) {
      windows.set(key, { start: now, count: 1 });
      return true;
    }
    if (current.count >= limit()) return false;
    current.count += 1;
    return true;
  }

  /** INCR a per-window key; the first hit sets its expiry. */
  async function consumeInRedis(redis, userId, now = Date.now()) {
    const windowStart = Math.floor(now / windowMs());
    const key = `chat:${name}:${Number(userId)}:${windowStart}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.pExpire(key, windowMs());
    return count <= limit();
  }

  /** Records one hit. Resolves false when the user is over the limit. */
  async function consume(userId) {
    if (redisConfig.isEnabled()) {
      try {
        return await consumeInRedis(await redisConfig.getRedis(), userId);
      } catch (err) {
        logger.warn('Rate limit store unavailable, using memory', { code: err.code || err.name });
      }
    }
    return consumeInMemory(userId);
  }

  function prune(now = Date.now()) {
    for (const [key, value] of windows) if (now - value.start >= windowMs()) windows.delete(key);
  }

  const limiter = { consume, consumeInRedis, reset: () => windows.clear(), prune };
  limiters.push(limiter);
  return limiter;
}

// Drop expired in-memory windows so the maps do not grow forever.
setInterval(() => limiters.forEach((l) => l.prune()), 60 * 1000).unref();

const messages = createRateLimiter({
  name: 'rate',
  limit: () => config.messages.rateLimit,
  windowMs: () => config.messages.rateWindowSeconds * 1000,
});

module.exports = {
  consume: messages.consume,
  consumeInRedis: messages.consumeInRedis,
  reset: messages.reset,
  createRateLimiter,
  resetAll: () => limiters.forEach((l) => l.reset()),
};
