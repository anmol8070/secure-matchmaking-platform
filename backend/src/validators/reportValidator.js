/**
 * Report payload (Phase 13). Reasons come from a fixed list (upper- or
 * lower-case accepted, stored lower-case); the description is optional,
 * trimmed and bounded. Status and any moderation fields cannot be sent.
 */
const { z, id } = require('./commonValidator');
const { REASONS, MAX_DESCRIPTION } = require('../services/reportService');

const createReportBody = z.strictObject(
  {
    reportedUserId: id(),
    reason: z
      .string()
      .transform((value) => value.trim().toLowerCase())
      .pipe(z.enum(Object.keys(REASONS), { error: `Reason must be one of: ${Object.keys(REASONS).join(', ')}` })),
    description: z
      .string()
      .transform((value) => value.replace(/\u0000/g, '').trim())
      .pipe(z.string().max(MAX_DESCRIPTION, `Description cannot be longer than ${MAX_DESCRIPTION} characters`))
      .optional(),
  },
  { error: 'Unsupported field' }
);

module.exports = { createReportBody };
