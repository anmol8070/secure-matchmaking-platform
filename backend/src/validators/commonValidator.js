/**
 * Validation foundation (zod).
 *
 * Usage in a route file:
 *   router.get('/:userId', validate({ params: userIdParams }), controller.getUser);
 *
 * Parsed (coerced, stripped) values are placed on req.validated.{body,params,query};
 * controllers should read from there rather than from req.body / req.params.
 * Failures become HTTP 422 with field-level `errors`.
 */
const { z } = require('zod');
const ApiError = require('../utils/ApiError');

const SOURCES = ['params', 'query', 'body'];

function formatIssues(issues, source) {
  return issues.map((issue) => ({
    field: [source, ...issue.path].join('.'),
    message: issue.message,
  }));
}

function validate(schemas) {
  return function validateRequest(req, res, next) {
    const validated = {};
    const errors = [];

    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source] ?? {});
      if (result.success) {
        validated[source] = result.data;
      } else {
        errors.push(...formatIssues(result.error.issues, source));
      }
    }

    if (errors.length > 0) return next(ApiError.validation(errors));
    req.validated = { ...req.validated, ...validated };
    return next();
  };
}

/* ---------- Reusable building blocks ---------- */

/** Positive integer id from a path/query string (ids are BIGINT surrogate keys). */
const id = () => z.coerce.number().int().positive();

const userIdParams = z.object({ userId: id() });

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { z, validate, id, userIdParams, paginationQuery };
