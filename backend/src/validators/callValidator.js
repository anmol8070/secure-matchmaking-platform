/**
 * Video call payload schemas, shared by the REST routes and the Socket.IO
 * signalling handlers. Signalling payloads are size-bounded and reduced to
 * the fields WebRTC needs; nothing else is relayed.
 */
const { z, id } = require('./commonValidator');

// A real SDP is a few KB; the cap leaves room for many codecs/candidates.
const MAX_SDP_LENGTH = 48 * 1024;
const MAX_CANDIDATE_LENGTH = 2048;

const callIdParams = z.object({ id: id() });
const initiateBody = z.object({ receiverId: id() });
const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: id().optional(),
});

/* ---------- Socket.IO payloads ---------- */

const callTarget = z.object({ callId: id() });
const userTarget = z.object({ userId: id() });

const description = (type) =>
  z.object({
    type: z.literal(type),
    sdp: z.string().min(1).max(MAX_SDP_LENGTH),
  });

const offerPayload = z.object({ callId: id(), description: description('offer') });
const answerPayload = z.object({ callId: id(), description: description('answer') });

const icePayload = z.object({
  callId: id(),
  candidate: z.object({
    // An empty string is the standard "end of candidates" marker.
    candidate: z.string().max(MAX_CANDIDATE_LENGTH),
    sdpMid: z.string().max(64).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }),
});

const endPayload = z.object({
  callId: id(),
  reason: z.enum(['hangup', 'navigated_away']).default('hangup'),
});

const failPayload = z.object({
  callId: id(),
  reason: z.enum(['connection_failed', 'media_error']).default('connection_failed'),
});

module.exports = {
  MAX_SDP_LENGTH,
  callIdParams,
  initiateBody,
  historyQuery,
  callTarget,
  userTarget,
  offerPayload,
  answerPayload,
  icePayload,
  endPayload,
  failPayload,
};
