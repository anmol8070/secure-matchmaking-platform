/**
 * /api/v1/connections — connections and connection requests.
 * All endpoints are Phase 3 placeholders (HTTP 501).
 */
const { Router } = require('express');
const connections = require('../controllers/connectionController');
const { validate, z, id } = require('../validators/commonValidator');

const router = Router();
const requestIdParams = z.object({ requestId: id() });

router.get('/', connections.listConnections);
router.get('/requests', connections.listRequests);
router.post('/requests', connections.sendRequest);
// Accept or reject a received request.
router.patch('/requests/:requestId', validate({ params: requestIdParams }), connections.respondToRequest);

module.exports = router;
