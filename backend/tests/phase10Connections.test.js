/**
 * Phase 10 — connection service unit tests (models and transaction mocked).
 * End-to-end behaviour against a real database is covered by
 * tests/integration/connections.test.js (npm run test:db).
 */
process.env.NODE_ENV = 'test';

jest.mock('../src/config/database', () => ({
  getDb: () => ({ transaction: async (fn) => fn('trx') }),
}));

jest.mock('../src/models/connectionRequestModel', () => ({
  STATUS: { PENDING: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected', CANCELLED: 'cancelled', DISCONNECTED: 'disconnected' },
  findBetween: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  reopen: jest.fn(),
  transition: jest.fn(),
  listWithCounterpart: jest.fn(),
}));

jest.mock('../src/models', () => ({
  ConnectionRequest: require('../src/models/connectionRequestModel'),
  ActivityFeedback: { logFeedback: jest.fn() },
  Block: { isBlocked: jest.fn() },
  Profile: { getActiveProfileById: jest.fn() },
  User: { findByPk: jest.fn() },
}));

const connectionService = require('../src/services/connectionService');
const { connectionEvents, CONNECTION_EVENTS } = require('../src/services/connectionEvents');
const { ActivityFeedback, Block, ConnectionRequest, Profile, User } = require('../src/models');

const SENDER = 1;
const RECEIVER = 2;
const STRANGER = 3;

const profile = (userId, extra = {}) => ({
  user_id: userId,
  name: `User ${userId}`,
  date_of_birth: '1995-01-01',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  profile_photo_url: null,
  // columns that must never reach the client
  email: 'secret@example.com',
  mobile: '+910000000000',
  password_hash: 'hash',
  ...extra,
});

const row = (overrides = {}) => ({
  request_id: 10,
  sender_id: SENDER,
  receiver_id: RECEIVER,
  status: 'pending',
  responded_at: null,
  created_at: new Date('2026-10-01T00:00:00Z'),
  updated_at: new Date('2026-10-01T00:00:00Z'),
  ...overrides,
});

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

let events;
const record = (name) => (payload) => events.push({ name, payload });
for (const name of Object.values(CONNECTION_EVENTS)) connectionEvents.on(name, record(name));

beforeEach(() => {
  jest.clearAllMocks();
  events = [];
  Profile.getActiveProfileById.mockImplementation(async (id) => profile(id));
  Block.isBlocked.mockResolvedValue(false);
  ConnectionRequest.findBetween.mockResolvedValue(undefined);
  ConnectionRequest.create.mockResolvedValue(10);
  ConnectionRequest.reopen.mockResolvedValue(true);
  ConnectionRequest.transition.mockResolvedValue(true);
});

/* ---------------- sending ---------------- */

describe('createConnectionRequest', () => {
  it('creates a pending request, logs connection_request and emits request_sent', async () => {
    ConnectionRequest.findById.mockResolvedValue(row());

    const result = await connectionService.createConnectionRequest(SENDER, RECEIVER);

    expect(result).toMatchObject({ id: 10, status: 'pending', direction: 'outgoing', senderId: SENDER, receiverId: RECEIVER });
    expect(ConnectionRequest.create).toHaveBeenCalledWith(SENDER, RECEIVER, 'trx');
    expect(ActivityFeedback.logFeedback).toHaveBeenCalledWith(
      { userId: SENDER, targetUserId: RECEIVER, action: 'connection_request', connectionRequestId: 10 },
      'trx'
    );
    expect(events).toEqual([
      { name: CONNECTION_EVENTS.REQUEST_SENT, payload: expect.objectContaining({ connectionId: 10, actorUserId: SENDER, targetUserId: RECEIVER }) },
    ]);
  });

  it('refuses a request to yourself with 400', async () => {
    await expect(connectionService.createConnectionRequest(SENDER, SENDER)).rejects.toMatchObject({
      statusCode: 400,
      message: 'You cannot send a connection request to yourself.',
    });
    expect(ConnectionRequest.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the receiver does not exist or is inactive', async () => {
    Profile.getActiveProfileById.mockImplementation(async (id) => (id === RECEIVER ? null : profile(id)));
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('requires the sender to have a profile', async () => {
    Profile.getActiveProfileById.mockImplementation(async (id) => (id === SENDER ? null : profile(id)));
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses blocked pairs with 403 (block checked in both directions by Block.isBlocked)', async () => {
    Block.isBlocked.mockResolvedValue(true);
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({ statusCode: 403 });
    expect(Block.isBlocked).toHaveBeenCalledWith(SENDER, RECEIVER, 'trx');
    expect(ConnectionRequest.create).not.toHaveBeenCalled();
  });

  it('returns 409 for a duplicate pending request', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row());
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Connection request already pending.',
    });
  });

  it('returns 409 pointing to the incoming request for a reverse request', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row());
    await expect(connectionService.createConnectionRequest(RECEIVER, SENDER)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/already sent you a connection request/),
    });
    expect(ConnectionRequest.create).not.toHaveBeenCalled();
  });

  it('returns 409 when the users are already connected', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'accepted' }));
    await expect(connectionService.createConnectionRequest(RECEIVER, SENDER)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Users are already connected.',
    });
  });

  it('makes a rejected sender wait for the cooldown', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'rejected', responded_at: daysAgo(1) }));
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/declined/),
    });
    expect(ConnectionRequest.reopen).not.toHaveBeenCalled();
  });

  it('lets the rejected sender ask again after the cooldown', async () => {
    const days = connectionService.REJECTED_REQUEST_COOLDOWN_DAYS + 1;
    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'rejected', responded_at: daysAgo(days) }));
    ConnectionRequest.findById.mockResolvedValue(row());
    await connectionService.createConnectionRequest(SENDER, RECEIVER);
    expect(ConnectionRequest.reopen).toHaveBeenCalledWith(10, 'rejected', SENDER, RECEIVER, 'trx');
  });

  it('lets the user who rejected send a request immediately (direction flips)', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'rejected', responded_at: new Date() }));
    ConnectionRequest.findById.mockResolvedValue(row({ sender_id: RECEIVER, receiver_id: SENDER }));
    const result = await connectionService.createConnectionRequest(RECEIVER, SENDER);
    expect(ConnectionRequest.reopen).toHaveBeenCalledWith(10, 'rejected', RECEIVER, SENDER, 'trx');
    expect(result.direction).toBe('outgoing');
  });

  it.each(['cancelled', 'disconnected'])('re-opens a %s relationship as a new request', async (status) => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status }));
    ConnectionRequest.findById.mockResolvedValue(row());
    await connectionService.createConnectionRequest(SENDER, RECEIVER);
    expect(ConnectionRequest.reopen).toHaveBeenCalledWith(10, status, SENDER, RECEIVER, 'trx');
    expect(ConnectionRequest.create).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent request re-opened the row first', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'cancelled' }));
    ConnectionRequest.reopen.mockResolvedValue(false);
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({ statusCode: 409 });
    expect(ActivityFeedback.logFeedback).not.toHaveBeenCalled();
  });

  it.each([
    ['PostgreSQL', { code: '23505' }],
    ['MySQL', { errno: 1062, code: 'ER_DUP_ENTRY' }],
  ])('turns a %s unique violation (concurrent insert) into 409', async (_, dbError) => {
    ConnectionRequest.create.mockRejectedValue(Object.assign(new Error('duplicate'), dbError));
    await expect(connectionService.createConnectionRequest(SENDER, RECEIVER)).rejects.toMatchObject({
      statusCode: 409,
      message: 'A connection request between you and this user already exists.',
    });
    expect(events).toEqual([]);
  });
});

/* ---------------- responding ---------------- */

describe('accept / reject / cancel / remove', () => {
  it('lets the receiver accept: pending → accepted, logged and emitted', async () => {
    ConnectionRequest.findById.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'accepted' }));

    const result = await connectionService.updateConnectionRequest(RECEIVER, 10, 'accept');

    expect(result).toMatchObject({ id: 10, status: 'accepted', direction: 'incoming' });
    expect(ConnectionRequest.transition).toHaveBeenCalledWith(10, 'pending', 'accepted', 'trx', { responded: true });
    expect(ActivityFeedback.logFeedback).toHaveBeenCalledWith(
      { userId: RECEIVER, targetUserId: SENDER, action: 'connection_accepted', connectionRequestId: 10 },
      'trx'
    );
    expect(events[0]).toMatchObject({ name: CONNECTION_EVENTS.REQUEST_ACCEPTED, payload: { actorUserId: RECEIVER, targetUserId: SENDER } });
  });

  it.each([
    ['accept', 'Only the recipient can accept this connection request.'],
    ['reject', 'Only the recipient can reject this connection request.'],
  ])('refuses %s by the sender with 403', async (action, message) => {
    ConnectionRequest.findById.mockResolvedValue(row());
    await expect(connectionService.updateConnectionRequest(SENDER, 10, action)).rejects.toMatchObject({ statusCode: 403, message });
    expect(ConnectionRequest.transition).not.toHaveBeenCalled();
  });

  it('refuses cancel by the receiver with 403', async () => {
    ConnectionRequest.findById.mockResolvedValue(row());
    await expect(connectionService.updateConnectionRequest(RECEIVER, 10, 'cancel')).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(['accept', 'reject', 'cancel'])('hides the request from a non-member (%s → 404)', async (action) => {
    ConnectionRequest.findById.mockResolvedValue(row());
    await expect(connectionService.updateConnectionRequest(STRANGER, 10, action)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns 404 for an unknown id', async () => {
    ConnectionRequest.findById.mockResolvedValue(undefined);
    await expect(connectionService.updateConnectionRequest(RECEIVER, 999, 'accept')).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['rejected', 'cancelled', 'accepted', 'disconnected'])('refuses to accept a %s request with 409', async (status) => {
    ConnectionRequest.findById.mockResolvedValue(row({ status }));
    await expect(connectionService.updateConnectionRequest(RECEIVER, 10, 'accept')).rejects.toMatchObject({ statusCode: 409 });
    expect(ConnectionRequest.transition).not.toHaveBeenCalled();
  });

  it('refuses to accept when the pair is blocked', async () => {
    ConnectionRequest.findById.mockResolvedValue(row());
    Block.isBlocked.mockResolvedValue(true);
    await expect(connectionService.updateConnectionRequest(RECEIVER, 10, 'accept')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 409 when a concurrent action changed the request first', async () => {
    ConnectionRequest.findById.mockResolvedValue(row());
    ConnectionRequest.transition.mockResolvedValue(false);
    await expect(connectionService.updateConnectionRequest(RECEIVER, 10, 'accept')).rejects.toMatchObject({ statusCode: 409 });
    expect(ActivityFeedback.logFeedback).not.toHaveBeenCalled();
  });

  it('lets the receiver reject: pending → rejected, logged as rejection', async () => {
    ConnectionRequest.findById.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'rejected' }));
    const result = await connectionService.updateConnectionRequest(RECEIVER, 10, 'reject');
    expect(result.status).toBe('rejected');
    expect(ActivityFeedback.logFeedback).toHaveBeenCalledWith(expect.objectContaining({ action: 'rejection' }), 'trx');
  });

  it('lets the sender cancel: pending → cancelled, logged as connection_cancelled', async () => {
    ConnectionRequest.findById.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: 'cancelled' }));
    const result = await connectionService.updateConnectionRequest(SENDER, 10, 'cancel');
    expect(result.status).toBe('cancelled');
    expect(ConnectionRequest.transition).toHaveBeenCalledWith(10, 'pending', 'cancelled', 'trx', { responded: undefined });
    expect(ActivityFeedback.logFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SENDER, targetUserId: RECEIVER, action: 'connection_cancelled' }),
      'trx'
    );
  });

  it.each([SENDER, RECEIVER])('lets either member (%s) remove an accepted connection', async (userId) => {
    ConnectionRequest.findById.mockResolvedValueOnce(row({ status: 'accepted' })).mockResolvedValueOnce(row({ status: 'disconnected' }));
    const result = await connectionService.removeConnection(userId, 10);
    expect(result.status).toBe('disconnected');
    expect(ConnectionRequest.transition).toHaveBeenCalledWith(10, 'accepted', 'disconnected', 'trx', { responded: undefined });
    expect(ActivityFeedback.logFeedback).toHaveBeenCalledWith(expect.objectContaining({ action: 'connection_removed' }), 'trx');
  });

  it('hides a connection from an unrelated user on remove (404)', async () => {
    ConnectionRequest.findById.mockResolvedValue(row({ status: 'accepted' }));
    await expect(connectionService.removeConnection(STRANGER, 10)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses to remove a request that is not an accepted connection', async () => {
    ConnectionRequest.findById.mockResolvedValue(row());
    await expect(connectionService.removeConnection(SENDER, 10)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects unsupported actions', () => {
    expect(() => connectionService.updateConnectionRequest(RECEIVER, 10, 'approve')).toThrow('Unsupported action.');
  });
});

/* ---------------- reading ---------------- */

describe('listing and details', () => {
  const listRow = (overrides) => ({ ...row(), ...profile(STRANGER), other_user_id: STRANGER, ...overrides });
  const listResult = (rows) => ({ orderBy: jest.fn().mockResolvedValue(rows) });

  it('returns received pending requests with only public profile fields', async () => {
    ConnectionRequest.listWithCounterpart.mockReturnValue(listResult([listRow()]));

    const requests = await connectionService.getReceivedRequests(RECEIVER);

    expect(ConnectionRequest.listWithCounterpart).toHaveBeenCalledWith(RECEIVER, 'received', ['pending']);
    expect(requests).toEqual([
      {
        id: 10,
        sender: { userId: STRANGER, name: `User ${STRANGER}`, profilePicture: null, age: expect.any(Number), location: 'Pune, Maharashtra, India' },
        status: 'pending',
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(requests)).not.toMatch(/secret@example|\+91|hash|date_of_birth|1995-01-01/);
  });

  it('returns sent requests (pending and declined)', async () => {
    ConnectionRequest.listWithCounterpart.mockReturnValue(listResult([listRow()]));
    const requests = await connectionService.getSentRequests(SENDER);
    expect(ConnectionRequest.listWithCounterpart).toHaveBeenCalledWith(SENDER, 'sent', ['pending', 'rejected']);
    expect(requests[0].receiver.userId).toBe(STRANGER);
  });

  it('returns accepted connections only', async () => {
    const respondedAt = new Date('2026-10-02T00:00:00Z');
    ConnectionRequest.listWithCounterpart.mockReturnValue(listResult([listRow({ status: 'accepted', responded_at: respondedAt })]));
    const connections = await connectionService.getMyConnections(SENDER);
    expect(ConnectionRequest.listWithCounterpart).toHaveBeenCalledWith(SENDER, 'connected', ['accepted']);
    expect(connections).toEqual([{ connectionId: 10, user: expect.objectContaining({ userId: STRANGER }), connectedAt: respondedAt.toISOString() }]);
  });

  it('returns details to a member, 404 to anyone else or when blocked', async () => {
    ConnectionRequest.findById.mockResolvedValue(row());
    await expect(connectionService.getConnectionById(SENDER, 10)).resolves.toMatchObject({ id: 10, user: { userId: RECEIVER } });
    await expect(connectionService.getConnectionById(STRANGER, 10)).rejects.toMatchObject({ statusCode: 404 });
    Block.isBlocked.mockResolvedValue(true);
    await expect(connectionService.getConnectionById(SENDER, 10)).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ---------------- relationship status ---------------- */

describe('getConnectionStatus', () => {
  it.each([
    ['no row', undefined, SENDER, { state: 'none', canSendRequest: true, connectionId: null }],
    ['outgoing pending', row(), SENDER, { state: 'pending_outgoing', canSendRequest: false, connectionId: 10 }],
    ['incoming pending', row(), RECEIVER, { state: 'pending_incoming', canSendRequest: false, connectionId: 10 }],
    ['accepted', row({ status: 'accepted' }), RECEIVER, { state: 'connected', canCommunicate: true }],
    ['cancelled', row({ status: 'cancelled' }), SENDER, { state: 'none', canSendRequest: true }],
    ['disconnected', row({ status: 'disconnected' }), RECEIVER, { state: 'none', canSendRequest: true }],
    ['rejected (viewer rejected it)', row({ status: 'rejected', responded_at: new Date() }), RECEIVER, { state: 'none', canSendRequest: true }],
    ['rejected (viewer was declined)', row({ status: 'rejected', responded_at: new Date() }), SENDER, { state: 'rejected', canSendRequest: false }],
  ])('%s', async (_, existing, viewer, expected) => {
    ConnectionRequest.findBetween.mockResolvedValue(existing);
    const other = viewer === SENDER ? RECEIVER : SENDER;
    await expect(connectionService.getConnectionStatus(viewer, other)).resolves.toMatchObject(expected);
  });

  it('reports blocked pairs as unavailable without revealing who blocked', async () => {
    Block.isBlocked.mockResolvedValue(true);
    const status = await connectionService.getConnectionStatus(SENDER, RECEIVER);
    expect(status).toEqual({ userId: RECEIVER, state: 'unavailable', connectionId: null, canSendRequest: false, canCommunicate: false });
  });

  it('returns 404 for a user that does not exist or is inactive', async () => {
    Profile.getActiveProfileById.mockResolvedValue(null);
    await expect(connectionService.getConnectionStatus(SENDER, 99)).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ---------------- communication precondition ---------------- */

describe('canUsersCommunicate', () => {
  beforeEach(() => {
    User.findByPk.mockImplementation(async (id) => ({ user_id: id, status: 'active' }));
  });

  it('allows accepted connections', async () => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'accepted' }));
    await expect(connectionService.canUsersCommunicate(SENDER, RECEIVER)).resolves.toBe(true);
    await expect(connectionService.assertCanCommunicate(RECEIVER, SENDER)).resolves.toBeUndefined();
  });

  it.each(['pending', 'rejected', 'cancelled', 'disconnected'])('denies %s relationships', async (status) => {
    ConnectionRequest.findBetween.mockResolvedValue(row({ status }));
    await expect(connectionService.canUsersCommunicate(SENDER, RECEIVER)).resolves.toBe(false);
    await expect(connectionService.assertCanCommunicate(SENDER, RECEIVER)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('denies users with no relationship, the same user, blocked pairs and inactive accounts', async () => {
    await expect(connectionService.canUsersCommunicate(SENDER, RECEIVER)).resolves.toBe(false);
    await expect(connectionService.canUsersCommunicate(SENDER, SENDER)).resolves.toBe(false);

    ConnectionRequest.findBetween.mockResolvedValue(row({ status: 'accepted' }));
    Block.isBlocked.mockResolvedValueOnce(true);
    await expect(connectionService.canUsersCommunicate(SENDER, RECEIVER)).resolves.toBe(false);

    User.findByPk.mockImplementation(async (id) => ({ user_id: id, status: id === RECEIVER ? 'suspended' : 'active' }));
    await expect(connectionService.canUsersCommunicate(SENDER, RECEIVER)).resolves.toBe(false);
  });
});
