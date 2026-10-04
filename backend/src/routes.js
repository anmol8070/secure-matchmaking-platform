/**
 * API v1 route registry — every route group is mounted here under /api/v1
 * (see app.js). Each group lives in its own file in src/routes/.
 */
const { Router } = require('express');

const MODULES = [
  ['/health', require('./routes/healthRoutes')],
  ['/auth', require('./routes/authRoutes')],
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
  ['/admin', require('./routes/adminRoutes')],
];

const router = Router();

for (const [path, moduleRouter] of MODULES) {
  router.use(path, moduleRouter);
}

module.exports = router;
