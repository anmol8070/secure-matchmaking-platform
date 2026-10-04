/**
 * Minimal structured console logger.
 * Can be swapped for winston/pino later without changing call sites.
 */
const config = require('../config/env');

function write(level, message, meta) {
  if (config.isTest) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta !== undefined) {
    stream(line, meta);
  } else {
    stream(line);
  }
}

module.exports = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
