/** GET /api/v1/health — API liveness. */
const { Router } = require('express');
const healthController = require('../controllers/healthController');

const router = Router();

router.get('/', healthController.getHealth);

module.exports = router;
