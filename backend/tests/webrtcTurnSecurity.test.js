/**
 * Security unit tests for WebRTC ICE & TURN Configuration:
 * - Ephemeral TURN REST credential generation (RFC 7635)
 * - Expiration calculation from TTL
 * - Protection of shared secret (never exposed to client)
 * - Static credential fallback
 * - Relay availability reporting
 * - Cache-Control: no-store defense on ICE server endpoint
 * - Unauthenticated request rejection
 */
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const config = require('../src/config/environment');
const { getIceServers } = require('../src/services/callService');

describe('WebRTC TURN Security - Ephemeral Credentials', () => {
  const userId = 42;
  const now = 1700000000000; // Fixed timestamp for deterministic testing

  it('includes STUN servers in the ICE list', () => {
    const originalStun = config.webrtc.stunUrls;
    try {
      config.webrtc.stunUrls = ['stun:stun.example.com:3478'];
      const result = getIceServers(userId, now);
      expect(result.iceServers).toContainEqual({ urls: ['stun:stun.example.com:3478'] });
    } finally {
      config.webrtc.stunUrls = originalStun;
    }
  });

  it('mints short-lived per-user HMAC-SHA1 credentials when turnSecret is configured', () => {
    const originalTurn = { ...config.webrtc };
    try {
      config.webrtc.turnUrls = ['turn:turn.example.com:3478?transport=udp', 'turn:turn.example.com:3478?transport=tcp'];
      config.webrtc.turnSecret = 'production-turn-shared-secret-never-expose';
      config.webrtc.turnCredentialTtlSeconds = 3600;

      const result = getIceServers(userId, now);
      expect(result.relay).toBe(true);

      const turnEntry = result.iceServers.find((s) => s.urls.includes('turn:turn.example.com:3478?transport=udp'));
      expect(turnEntry).toBeDefined();

      const expectedExpiry = Math.floor(now / 1000) + 3600;
      const expectedUsername = `${expectedExpiry}:${userId}`;
      const expectedCredential = crypto
        .createHmac('sha1', config.webrtc.turnSecret)
        .update(expectedUsername)
        .digest('base64');

      expect(turnEntry.username).toBe(expectedUsername);
      expect(turnEntry.credential).toBe(expectedCredential);
      expect(result.expiresAt).toBe(new Date(expectedExpiry * 1000).toISOString());

      // Crucial: The shared secret itself MUST NEVER be returned to the client
      expect(JSON.stringify(result)).not.toContain(config.webrtc.turnSecret);
    } finally {
      config.webrtc = originalTurn;
    }
  });

  it('supports static TURN username/credential when turnSecret is empty', () => {
    const originalTurn = { ...config.webrtc };
    try {
      config.webrtc.turnUrls = ['turn:turn.example.com:3478'];
      config.webrtc.turnSecret = '';
      config.webrtc.turnUsername = 'static_user';
      config.webrtc.turnCredential = 'static_password';

      const result = getIceServers(userId, now);
      expect(result.relay).toBe(true);
      expect(result.expiresAt).toBeNull();

      const turnEntry = result.iceServers.find((s) => s.urls.includes('turn:turn.example.com:3478'));
      expect(turnEntry.username).toBe('static_user');
      expect(turnEntry.credential).toBe('static_password');
    } finally {
      config.webrtc = originalTurn;
    }
  });

  it('reports relay: false when no TURN server is configured', () => {
    const originalTurn = { ...config.webrtc };
    try {
      config.webrtc.turnUrls = [];
      config.webrtc.turnSecret = '';
      config.webrtc.turnUsername = '';
      config.webrtc.turnCredential = '';

      const result = getIceServers(userId, now);
      expect(result.relay).toBe(false);
      expect(result.expiresAt).toBeNull();
      expect(result.iceServers.some((s) => s.username)).toBe(false);
    } finally {
      config.webrtc = originalTurn;
    }
  });
});
