/**
 * Phase 12 — unit tests for ICE server configuration and call formatting.
 * Signalling, state machine and authorization against a real database and
 * real sockets: tests/integration/calls.test.js.
 */
process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const config = require('../src/config/environment');
const callService = require('../src/services/callService');

const ORIGINAL = { ...config.webrtc };
afterEach(() => Object.assign(config.webrtc, ORIGINAL));

describe('getIceServers', () => {
  it('returns only STUN when no TURN relay is configured', () => {
    Object.assign(config.webrtc, { stunUrls: ['stun:stun.example.com:3478'], turnUrls: [] });
    expect(callService.getIceServers(7)).toEqual({ iceServers: [{ urls: ['stun:stun.example.com:3478'] }], expiresAt: null, relay: false });
  });

  it('mints expiring per-user credentials from the TURN shared secret', () => {
    Object.assign(config.webrtc, { turnUrls: ['turns:turn.example.com:5349'], turnSecret: 's3cret', turnCredentialTtlSeconds: 120 });
    const now = Date.UTC(2026, 9, 22, 12, 0, 0);
    const { iceServers, expiresAt, relay } = callService.getIceServers(7, now);
    const turn = iceServers[1];
    const expiry = now / 1000 + 120;
    expect(turn).toEqual({
      urls: ['turns:turn.example.com:5349'],
      username: `${expiry}:7`,
      credential: crypto.createHmac('sha1', 's3cret').update(`${expiry}:7`).digest('base64'),
    });
    expect(expiresAt).toBe(new Date(expiry * 1000).toISOString());
    expect(relay).toBe(true);
    expect(JSON.stringify(iceServers)).not.toContain('s3cret');
  });

  it('falls back to static TURN credentials, and omits TURN when they are incomplete', () => {
    Object.assign(config.webrtc, { turnUrls: ['turn:turn.example.com'], turnSecret: '', turnUsername: 'app', turnCredential: 'pw' });
    expect(callService.getIceServers(7).iceServers[1]).toEqual({ urls: ['turn:turn.example.com'], username: 'app', credential: 'pw' });

    Object.assign(config.webrtc, { turnUsername: '', turnCredential: '' });
    expect(callService.getIceServers(7).iceServers).toHaveLength(1);
  });
});

describe('formatCall', () => {
  it('describes the call from the viewer’s side, metadata only', () => {
    const row = {
      call_id: 5,
      caller_id: 1,
      receiver_id: 2,
      status: 'ended',
      created_at: new Date('2026-10-22T10:00:00Z'),
      answered_at: new Date('2026-10-22T10:00:05Z'),
      connected_at: new Date('2026-10-22T10:00:07Z'),
      ended_at: new Date('2026-10-22T10:05:07Z'),
      duration_seconds: 300,
      end_reason: 'hangup',
    };
    expect(callService.formatCall(row, 2, { userId: 1, name: 'A' })).toEqual({
      id: 5,
      callerId: 1,
      receiverId: 2,
      direction: 'incoming',
      status: 'ended',
      createdAt: '2026-10-22T10:00:00.000Z',
      answeredAt: '2026-10-22T10:00:05.000Z',
      connectedAt: '2026-10-22T10:00:07.000Z',
      endedAt: '2026-10-22T10:05:07.000Z',
      durationSeconds: 300,
      endReason: 'hangup',
      otherUser: { userId: 1, name: 'A' },
    });
  });
});
