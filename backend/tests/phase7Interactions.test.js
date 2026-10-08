/**
 * Connection requests as interaction signals. Phase 10 replaced the Phase 7
 * sendRequest() API with createConnectionRequest(); the interaction is now
 * logged straight to activity_feedback (no online ML training step).
 * Full lifecycle coverage: phase10Connections.test.js.
 */
jest.mock('../src/config/database', () => ({
  getDb: () => ({ transaction: async (fn) => fn('trx') }),
}));
jest.mock('../src/models/connectionRequestModel');
jest.mock('../src/models/profileModel');
jest.mock('../src/models/blockModel');
jest.mock('../src/models/activityFeedbackModel');

const connectionService = require('../src/services/connectionService');
const { ConnectionRequest, Profile, Block, ActivityFeedback } = require('../src/models');

describe('Connection & Interaction Services Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectionService', () => {
    it('sends a connection request and records the interaction', async () => {
      Profile.getActiveProfileById.mockImplementation(async (id) => ({ user_id: id, name: 'Target' }));
      Block.isBlocked.mockResolvedValue(false);
      ConnectionRequest.findBetween.mockResolvedValue(undefined);
      ConnectionRequest.create.mockResolvedValue(100);
      ConnectionRequest.findById.mockResolvedValue({ request_id: 100, sender_id: 1, receiver_id: 2, status: 'pending' });

      const result = await connectionService.createConnectionRequest(1, 2);

      expect(result).toMatchObject({ id: 100, senderId: 1, receiverId: 2, status: 'pending' });
      expect(ActivityFeedback.logFeedback).toHaveBeenCalledWith(
        { userId: 1, targetUserId: 2, action: 'connection_request', connectionRequestId: 100 },
        'trx'
      );
    });

    it('rejects connection request to self', async () => {
      await expect(connectionService.createConnectionRequest(1, 1)).rejects.toThrow(
        'You cannot send a connection request to yourself.'
      );
    });

    it('rejects connection request when target is blocked', async () => {
      Profile.getActiveProfileById.mockImplementation(async (id) => ({ user_id: id }));
      Block.isBlocked.mockResolvedValue(true);

      await expect(connectionService.createConnectionRequest(1, 2)).rejects.toThrow('You cannot connect with this user.');
    });
  });
});
