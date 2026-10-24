/**
 * Privacy settings payload (Phase 13). Strict: unknown keys (including any
 * attempt to name another user, e.g. userId) are rejected with 422; values
 * must be one of the allowed levels for that setting.
 */
const { z } = require('./commonValidator');
const { SETTINGS } = require('../services/privacyService');

const shape = Object.fromEntries(
  Object.entries(SETTINGS).map(([key, setting]) => [
    key,
    z.enum(setting.levels, { error: `Must be one of: ${setting.levels.join(', ')}` }).optional(),
  ])
);

const updatePrivacyBody = z
  .strictObject(shape, { error: 'Unsupported privacy setting' })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one setting to change' });

module.exports = { updatePrivacyBody };
