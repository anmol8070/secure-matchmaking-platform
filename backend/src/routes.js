/**
 * API v1 route registry — every route group is mounted here under /api/v1
 * (see app.js). Each group lives in its own file in src/routes/.
 *
 * Public:     /health, /auth (each auth route decides), /admin/login
 * Protected:  every other module requires a valid access token (requireAuth);
 *             /admin/* additionally requires role=admin (in adminRoutes).
 */
const { Router } = require('express');
const config = require('./config/environment');
const { requireAuth } = require('./middleware/authMiddleware');

const PUBLIC_MODULES = [
  ['/health', require('./routes/healthRoutes')],
  ['/auth', require('./routes/authRoutes')],
  ['/admin', require('./routes/adminRoutes')],
];

const PROTECTED_MODULES = [
  ['/profile', require('./routes/profileRoutes')],
  ['/preferences', require('./routes/preferenceRoutes')],
  ['/hobbies', require('./routes/hobbyRoutes')],
  ['/matches', require('./routes/matchRoutes')],
  ['/recommendations', require('./routes/recommendationRoutes')],
  ['/connections', require('./routes/connectionRoutes')],
  ['/messages', require('./routes/messageRoutes')],
  ['/reports', require('./routes/reportRoutes')],
  ['/blocks', require('./routes/blockRoutes')],
  ['/feedback', require('./routes/feedbackRoutes')],
];

const router = Router();

for (const [path, moduleRouter] of PUBLIC_MODULES) {
  router.use(path, moduleRouter);
}
for (const [path, moduleRouter] of PROTECTED_MODULES) {
  router.use(path, requireAuth, moduleRouter);
}

// Development tooling — never mounted in production.
if (!config.isProduction && config.otp.provider === 'dev') {
  router.use('/dev', require('./routes/devRoutes'));
}

module.exports = router;
