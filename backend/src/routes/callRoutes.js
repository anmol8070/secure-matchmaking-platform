/**
 * /api/v1/calls — private video calls (Phase 12). Protected by requireAuth.
 * REST covers call control and history; WebRTC signalling is Socket.IO only.
 * Fixed paths are declared before /:id.
 */
const { Router } = require('express');
const calls = require('../controllers/callController');
const { validate } = require('../validators/commonValidator');
const { callIdParams, initiateBody, historyQuery } = require('../validators/callValidator');

const router = Router();

router.get('/ice-servers', calls.getIceServers);
router.get('/history', validate({ query: historyQuery }), calls.getHistory);
router.post('/', validate({ body: initiateBody }), calls.initiateCall);
router.get('/:id', validate({ params: callIdParams }), calls.getCall);
router.post('/:id/accept', validate({ params: callIdParams }), calls.acceptCall);
router.post('/:id/reject', validate({ params: callIdParams }), calls.rejectCall);
router.post('/:id/end', validate({ params: callIdParams }), calls.endCall);

module.exports = router;
