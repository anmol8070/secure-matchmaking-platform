/**
 * Knex CLI configuration (used by `npm run db:*` scripts).
 * All values come from backend/.env via src/config/env.js.
 */
const { buildKnexConfig } = require('./src/config/database');

module.exports = buildKnexConfig();
