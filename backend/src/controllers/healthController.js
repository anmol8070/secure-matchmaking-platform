const healthService = require('../services/healthService');

function getHealth(req, res) {
  res.status(200).json(healthService.getStatus());
}

module.exports = { getHealth };
