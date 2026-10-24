/**
 * Phase 11 — messageService unit tests (models and Phase 10 service mocked).
 * Real-database + real-socket behaviour: tests/integration/chat.test.js.
 */
process.env.NODE_ENV = 'test';

jest.mock('../src/models', () => ({
  Block: { isBlocked: jest.fn() },
  ConnectionRequest: { findBetween: jest.fn() },
  Message: {
    create: jest.fn(),
    findById: jest.fn(),
    listConversation: jest.fn(),
    existsBetween: jest.fn(),
    markDelivered: jest.fn(),
    markReadUpTo: jest.fn(),
    listConversationSummaries: jest.fn(),
  },
  Profile: { getActiveProfileById: jest.fn() },
}));
jest.mock('../src/services/connectionService', () => ({
  canUsersCommunicate: jest.fn(),
}));
// Chat headers are privacy-filtered cards (Phase 13); privacy rules have their own tests.
jest.mock('../src/services/privacyService', () => ({
  cardFor: async (viewerId, userId, profile) => ({ userId: Number(userId), name: profile.name }),
  cardsFor: async () => new Map(),
  RELATIONSHIP: { MEMBER: 'member' },
}));

const config = require('../src/config/environment');
const messageService = require('../src/services/messageService');
const rateLimiter = require('../src/services/messageRateLimiter');
const { messageEvents, MESSAGE_EVENTS } = require('../src/services/messageEvents');
const connectionService = require('../src/services/connectionService');
const { sendMessageBody, historyQuery } = require('../src/validators/messageValidator');
const { Block, ConnectionRequest, Message, Profile } = require('../src/models');

const A = 1;
const B = 2;
const C = 3;

const row = (overrides = {}) => ({
  message_id: 100,
  sender_id: A,
  receiver_id: B,
  message: 'Hello',
  message_type: 'text',
  sent_at: new Date('2026-10-21T10:00:00Z'),
  delivered_at: null,
  read_at: null,
  ...overrides,
});

let events;
for (const name of Object.values(MESSAGE_EVENTS)) messageEvents.on(name, (payload) => events.push({ name, payload }));

beforeEach(() => {
  jest.clearAllMocks();
  rateLimiter.reset();
  events = [];
  Profile.getActiveProfileById.mockImplementation(async (id) => ({ user_id: id, name: `User ${id}` }));
  Block.isBlocked.mockResolvedValue(false);
  ConnectionRequest.findBetween.mockResolvedValue({ request_id: 55, status: 'accepted' });
  connectionService.canUsersCommunicate.mockResolvedValue(true);
  Message.existsBetween.mockResolvedValue(false);
  Message.markDelivered.mockResolvedValue([]);
});

describe('sendMessage', () => {
  it('reuses canUsersCommunicate, persists, then emits message.created', async () => {
    const order = [];
    Message.create.mockImplementation(async () => {
      order.push('persist');
      return row();
    });
    messageEvents.once(MESSAGE_EVENTS.MESSAGE_CREATED, () => order.push('emit'));

    const result = await messageService.sendMessage(A, { receiverId: B, message: 'Hello', type: 'text' });

    expect(connectionService.canUsersCommunicate).toHaveBeenCalledWith(A, B, undefined);
    expect(Message.create).toHaveBeenCalledWith({ senderId: A, receiverId: B, message: 'Hello', messageType: 'text' });
    expect(order).toEqual(['persist', 'emit']);
    expect(result).toEqual({
      id: 100,
      conversationId: 55,
      senderId: A,
      receiverId: B,
      type: 'text',
      message: 'Hello',
      image: null,
      status: 'sent',
      createdAt: '2026-10-21T10:00:00.000Z',
      deliveredAt: null,
      readAt: null,
    });
  });

  it('refuses users who may not communicate (pending/rejected/cancelled/disconnected)', async () => {
    connectionService.canUsersCommunicate.mockResolvedValue(false);
    await expect(messageService.sendMessage(A, { receiverId: B, message: 'hi' })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Messaging is available only between connected users.',
    });
    expect(Message.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('refuses blocked pairs with a neutral message', async () => {
    Block.isBlocked.mockResolvedValue(true);
    await expect(messageService.sendMessage(A, { receiverId: B, message: 'hi' })).rejects.toMatchObject({
      statusCode: 403,
      message: 'You cannot message this user.',
    });
  });

  it('refuses yourself (400) and unknown or inactive users (404)', async () => {
    await expect(messageService.sendMessage(A, { receiverId: A, message: 'hi' })).rejects.toMatchObject({ statusCode: 400 });
    Profile.getActiveProfileById.mockResolvedValue(null);
    await expect(messageService.sendMessage(A, { receiverId: B, message: 'hi' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not report success when saving fails', async () => {
    Message.create.mockRejectedValue(new Error('db down'));
    await expect(messageService.sendMessage(A, { receiverId: B, message: 'hi' })).rejects.toThrow('db down');
    expect(events).toEqual([]);
  });

  it('applies the per-user rate limit', async () => {
    Message.create.mockResolvedValue(row());
    const original = config.messages.rateLimit;
    config.messages.rateLimit = 2;
    try {
      await messageService.sendMessage(A, { receiverId: B, message: '1' });
      await messageService.sendMessage(A, { receiverId: B, message: '2' });
      await expect(messageService.sendMessage(A, { receiverId: B, message: '3' })).rejects.toMatchObject({ statusCode: 429 });
      await expect(messageService.sendMessage(B, { receiverId: A, message: 'other user' })).resolves.toBeDefined();
    } finally {
      config.messages.rateLimit = original;
    }
  });
});

describe('getConversationMessages', () => {
  it('returns a page oldest → newest with a cursor and marks incoming messages delivered', async () => {
    Message.listConversation.mockResolvedValue([row({ message_id: 3, sender_id: B, receiver_id: A }), row({ message_id: 2 }), row({ message_id: 1 })]);
    Message.markDelivered.mockResolvedValue([3]);

    const result = await messageService.getConversationMessages(A, B, { limit: 2 });

    expect(Message.listConversation).toHaveBeenCalledWith(A, B, { limit: 3, before: undefined });
    expect(result.messages.map((m) => m.id)).toEqual([2, 3]);
    expect(result.messages[1].status).toBe('delivered');
    expect(result.pagination).toEqual({ limit: 2, hasMore: true, nextCursor: 2 });
    expect(result).toMatchObject({ conversationId: 55, canSend: true, participant: { userId: B } });
    expect(events).toEqual([{ name: MESSAGE_EVENTS.MESSAGES_DELIVERED, payload: expect.objectContaining({ senderId: B, receiverId: A, messageIds: [3] }) }]);
  });

  it('keeps history readable after a connection ends, if messages exist', async () => {
    connectionService.canUsersCommunicate.mockResolvedValue(false);
    ConnectionRequest.findBetween.mockResolvedValue({ request_id: 55, status: 'disconnected' });
    Message.existsBetween.mockResolvedValue(true);
    Message.listConversation.mockResolvedValue([row()]);
    await expect(messageService.getConversationMessages(A, B, { limit: 10 })).resolves.toMatchObject({ canSend: false });
  });

  it('refuses strangers and blocked pairs', async () => {
    connectionService.canUsersCommunicate.mockResolvedValue(false);
    ConnectionRequest.findBetween.mockResolvedValue(undefined);
    await expect(messageService.getConversationMessages(C, B, { limit: 10 })).rejects.toMatchObject({ statusCode: 403 });

    Block.isBlocked.mockResolvedValue(true);
    await expect(messageService.getConversationMessages(A, B, { limit: 10 })).rejects.toMatchObject({ statusCode: 403 });
    expect(Message.listConversation).not.toHaveBeenCalled();
  });
});

describe('markMessageRead', () => {
  it('lets the receiver mark up to a message as read and emits message.read', async () => {
    Message.findById.mockResolvedValue(row());
    Message.markReadUpTo.mockResolvedValue({ ids: [99, 100], readAt: new Date('2026-10-21T11:00:00Z') });
    const result = await messageService.markMessageRead(B, 100);
    expect(Message.markReadUpTo).toHaveBeenCalledWith(B, A, 100);
    expect(result).toEqual({ conversationId: 55, senderId: A, readerId: B, messageIds: [99, 100], readAt: '2026-10-21T11:00:00.000Z' });
    expect(events[0]).toMatchObject({ name: MESSAGE_EVENTS.MESSAGES_READ });
  });

  it('refuses the sender (403) and outsiders (404)', async () => {
    Message.findById.mockResolvedValue(row());
    await expect(messageService.markMessageRead(A, 100)).rejects.toMatchObject({ statusCode: 403 });
    await expect(messageService.markMessageRead(C, 100)).rejects.toMatchObject({ statusCode: 404 });
    Message.findById.mockResolvedValue(undefined);
    await expect(messageService.markMessageRead(B, 100)).rejects.toMatchObject({ statusCode: 404 });
    expect(Message.markReadUpTo).not.toHaveBeenCalled();
  });
});

describe('canAccessConversation', () => {
  it('is false instead of throwing for missing users or yourself', async () => {
    await expect(messageService.canAccessConversation(A, A)).resolves.toBe(false);
    Profile.getActiveProfileById.mockResolvedValue(null);
    await expect(messageService.canAccessConversation(A, B)).resolves.toBe(false);
  });
});

describe('payload validation', () => {
  it('trims, strips NUL characters and bounds the message', () => {
    expect(sendMessageBody.parse({ receiverId: '2', message: '  hi\u0000 there  ' })).toEqual({ receiverId: 2, message: 'hi there', type: 'text' });
    expect(sendMessageBody.safeParse({ receiverId: 2, message: ' \n ' }).success).toBe(false);
    expect(sendMessageBody.safeParse({ receiverId: 2, message: 'x'.repeat(config.messages.maxLength + 1) }).success).toBe(false);
    expect(sendMessageBody.safeParse({ receiverId: 2, message: 'hi', type: 'image' }).success).toBe(false);
    expect(sendMessageBody.parse({ receiverId: 2, message: 'hi', type: 'TEXT', senderId: 9 })).toEqual({ receiverId: 2, message: 'hi', type: 'text' });
  });

  it('defaults and caps the history limit', () => {
    expect(historyQuery.parse({})).toEqual({ limit: config.messages.defaultLimit });
    expect(historyQuery.safeParse({ limit: String(config.messages.maxLimit + 1) }).success).toBe(false);
  });
});

/* ---------------- images ---------------- */

jest.mock('../src/services/chatImageService', () => ({
  processImage: jest.fn(),
  store: jest.fn(),
  read: jest.fn(),
  remove: jest.fn(),
}));
jest.mock('../src/config/redis', () => ({ isEnabled: jest.fn(() => false), getRedis: jest.fn(), createRedisClient: jest.fn() }));

describe('sendImageMessage', () => {
  const chatImageService = require('../src/services/chatImageService');
  const processed = { buffer: Buffer.from('x'), width: 10, height: 20, size: 1, contentType: 'image/webp' };
  const file = { buffer: Buffer.from('raw'), size: 3 };

  beforeEach(() => {
    chatImageService.processImage.mockResolvedValue(processed);
    chatImageService.store.mockResolvedValue('chat-images/key.webp');
  });

  it('checks permission before touching the upload', async () => {
    connectionService.canUsersCommunicate.mockResolvedValue(false);
    await expect(messageService.sendImageMessage(A, { receiverId: B }, file)).rejects.toMatchObject({ statusCode: 403 });
    expect(chatImageService.processImage).not.toHaveBeenCalled();
    expect(chatImageService.store).not.toHaveBeenCalled();
  });

  it('stores the image and returns an image message without the storage key', async () => {
    Message.create.mockResolvedValue(
      row({ message: 'caption', message_type: 'image', attachment_key: 'chat-images/key.webp', attachment_content_type: 'image/webp', attachment_width: 10, attachment_height: 20, attachment_size: 1 })
    );
    const result = await messageService.sendImageMessage(A, { receiverId: B, caption: 'caption' }, file);
    expect(Message.create).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'image', message: 'caption', attachment: { key: 'chat-images/key.webp', contentType: 'image/webp', width: 10, height: 20, size: 1 } })
    );
    expect(result).toMatchObject({ type: 'image', image: { path: '/messages/100/image', width: 10, height: 20 } });
    expect(JSON.stringify(result)).not.toContain('key.webp');
  });

  it('removes the stored file when the message cannot be saved', async () => {
    Message.create.mockRejectedValue(new Error('db down'));
    await expect(messageService.sendImageMessage(A, { receiverId: B }, file)).rejects.toThrow('db down');
    expect(chatImageService.remove).toHaveBeenCalledWith('chat-images/key.webp');
    expect(events).toEqual([]);
  });

  it('serves the file only to participants of an image message', async () => {
    chatImageService.read.mockResolvedValue(Buffer.from('img'));
    Message.findById.mockResolvedValue(row({ message_type: 'image', attachment_key: 'chat-images/key.webp', attachment_content_type: 'image/webp' }));
    await expect(messageService.getMessageImage(B, 100)).resolves.toEqual({ buffer: Buffer.from('img'), contentType: 'image/webp' });
    await expect(messageService.getMessageImage(C, 100)).rejects.toMatchObject({ statusCode: 404 });

    Message.findById.mockResolvedValue(row()); // a text message has no image
    await expect(messageService.getMessageImage(B, 100)).rejects.toMatchObject({ statusCode: 404 });
  });
});

/* ---------------- shared rate limit store (REDIS_URL) ---------------- */

describe('rate limiter with Redis', () => {
  const redisConfig = require('../src/config/redis');

  function fakeRedis() {
    const counts = new Map();
    return {
      incr: jest.fn(async (key) => {
        counts.set(key, (counts.get(key) || 0) + 1);
        return counts.get(key);
      }),
      pExpire: jest.fn(async () => true),
    };
  }

  afterEach(() => redisConfig.isEnabled.mockReturnValue(false));

  it('counts per user and window in Redis and sets the expiry once', async () => {
    const redis = fakeRedis();
    const original = config.messages.rateLimit;
    config.messages.rateLimit = 2;
    try {
      expect(await rateLimiter.consumeInRedis(redis, A)).toBe(true);
      expect(await rateLimiter.consumeInRedis(redis, A)).toBe(true);
      expect(await rateLimiter.consumeInRedis(redis, A)).toBe(false);
      expect(await rateLimiter.consumeInRedis(redis, B)).toBe(true);
      expect(redis.pExpire).toHaveBeenCalledTimes(2); // first hit of each key only
      expect(redis.incr.mock.calls[0][0]).toMatch(/^chat:rate:1:\d+$/);
    } finally {
      config.messages.rateLimit = original;
    }
  });

  it('uses Redis when REDIS_URL is set and falls back to memory if it is down', async () => {
    const redis = fakeRedis();
    redisConfig.isEnabled.mockReturnValue(true);
    redisConfig.getRedis.mockResolvedValue(redis);
    await rateLimiter.consume(A);
    expect(redis.incr).toHaveBeenCalledTimes(1);

    redisConfig.getRedis.mockRejectedValue(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    await expect(rateLimiter.consume(A)).resolves.toBe(true);
  });
});
