const healthService = require('../services/health.service');

function getHealth(req, res) {
  res.status(200).json(healthService.getStatus());
}

module.exports = { getHealth };
