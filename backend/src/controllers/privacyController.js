/**
 * Privacy settings endpoints (Phase 13). The settings always belong to the
 * authenticated user (req.auth.userId) — no user id is accepted from the client.
 */
const privacyService = require('../services/privacyService');
const { sendSuccess } = require('../utils/apiResponse');

async function getSettings(req, res) {
  const settings = await privacyService.getPrivacySettings(req.auth.userId);
  sendSuccess(res, { data: { settings, options: optionList() } });
}

async function updateSettings(req, res) {
  const settings = await privacyService.updatePrivacySettings(req.auth.userId, req.validated.body);
  sendSuccess(res, { message: 'Privacy settings saved.', data: { settings } });
}

/** The allowed levels per setting, so clients can build the form. */
function optionList() {
  return Object.fromEntries(Object.entries(privacyService.SETTINGS).map(([key, s]) => [key, s.levels]));
}

module.exports = { getSettings, updateSettings };
