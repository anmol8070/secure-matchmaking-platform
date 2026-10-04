/**
 * requireRole(...roles) — role-based authorization. Use after requireAuth.
 *
 *   router.use(requireAuth, requireRole(ROLES.ADMIN));
 */
const ApiError = require('../utils/ApiError');

function requireRole(...allowedRoles) {
  return function authorize(req, res, next) {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.auth.role)) return next(ApiError.forbidden());
    return next();
  };
}

module.exports = { requireRole };
