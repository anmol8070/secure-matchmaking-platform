/**
 * /api/v1/connections — connections and connection requests.
 */
const { Router } = require('express');
const connections = require('../controllers/connectionController');
const { validate, z, id } = require('../validators/commonValidator');

const router = Router();
const requestIdParams = z.object({ requestId: id() });
const sendRequestBody = z.object({ receiverId: id() });
const respondRequestBody = z.object({ status: z.enum(['accepted', 'rejected']) });
const requestQuery = z.object({ status: z.enum(['pending', 'accepted', 'rejected']).optional() });

router.get('/', connections.listConnections);
router.get('/requests', validate({ query: requestQuery }), connections.listRequests);
router.post('/requests', validate({ body: sendRequestBody }), connections.sendRequest);
router.patch('/requests/:requestId', validate({ params: requestIdParams, body: respondRequestBody }), connections.respondToRequest);

module.exports = router;
