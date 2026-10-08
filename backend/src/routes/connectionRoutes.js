/**
 * /api/v1/connections — connection requests and connections (Phase 10).
 * Protected by requireAuth (routes.js). Fixed paths are declared before /:id.
 */
const { Router } = require('express');
const connections = require('../controllers/connectionController');
const { validate, z, id, userIdParams } = require('../validators/commonValidator');

const router = Router();

const connectionIdParams = z.object({ id: id() });
const sendRequestBody = z.object({ receiverId: id() });
const updateRequestBody = z.object({ action: z.enum(['accept', 'reject', 'cancel']) });

router.get('/', connections.getMyConnections);
router.post('/', validate({ body: sendRequestBody }), connections.createConnectionRequest);
router.get('/requests/received', connections.getReceivedRequests);
router.get('/requests/sent', connections.getSentRequests);
router.get('/status/:userId', validate({ params: userIdParams }), connections.getConnectionStatus);
router.get('/:id', validate({ params: connectionIdParams }), connections.getConnectionById);
router.put('/:id', validate({ params: connectionIdParams, body: updateRequestBody }), connections.updateConnectionRequest);
router.delete('/:id', validate({ params: connectionIdParams }), connections.removeConnection);

module.exports = router;
