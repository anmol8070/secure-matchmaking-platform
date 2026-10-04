/** Hobby catalogue. The user's own selection is managed under /preferences/hobbies. */
const hobbyService = require('../services/hobbyService');
const { sendSuccess } = require('../utils/apiResponse');

async function listHobbies(req, res) {
  sendSuccess(res, { data: await hobbyService.listActive() });
}

module.exports = { listHobbies };
