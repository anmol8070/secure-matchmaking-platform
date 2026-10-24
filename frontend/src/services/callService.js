/**
 * Video call REST API (Phase 12): ICE servers, call details and history.
 * Call control and WebRTC signalling go over the shared socket
 * (socketService); REST is used for data that must come from the database.
 */
import { apiClient } from './apiClient.js';

const AUTH = { auth: true };

export const callService = {
  /** STUN/TURN servers for RTCPeerConnection (TURN credentials are short-lived). */
  getIceServers: () => apiClient.get('/calls/ice-servers', AUTH),
  getCall: (callId) => apiClient.get(`/calls/${callId}`, AUTH),
  getHistory: ({ before, limit } = {}) => apiClient.get('/calls/history', { ...AUTH, params: { before, limit } }),
};
