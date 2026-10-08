const connectionService = require('../src/services/connectionService');
const feedbackService = require('../src/services/feedbackService');
const { ConnectionRequest, Profile, Block, ActivityFeedback } = require('../src/models');

jest.mock('../src/models/connectionRequestModel');
jest.mock('../src/models/profileModel');
jest.mock('../src/models/blockModel');
jest.mock('../src/models/activityFeedbackModel');
jest.mock('../src/services/feedbackService');

describe('Connection & Interaction Services Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectionService', () => {
    it('sends a connection request and records feedback interaction', async () => {
      Profile.findByPk.mockResolvedValue({ user_id: 2, name: 'Target' });
      Block.isBlocked.mockResolvedValue(false);
      ConnectionRequest.sendRequest.mockResolvedValue(100);
      feedbackService.recordFeedback.mockResolvedValue({});

      const result = await connectionService.sendRequest(1, 2);

      expect(result).toEqual({
        requestId: 100,
        senderId: 1,
        receiverId: 2,
        status: 'pending',
      });
      expect(feedbackService.recordFeedback).toHaveBeenCalledWith(
        1,
        { targetUserId: 2, action: 'connection_request' },
        undefined
      );
    });

    it('rejects connection request to self', async () => {
      await expect(connectionService.sendRequest(1, 1)).rejects.toThrow(
        'Cannot send a connection request to yourself'
      );
    });

    it('rejects connection request when target is blocked', async () => {
      Profile.findByPk.mockResolvedValue({ user_id: 2 });
      Block.isBlocked.mockResolvedValue(true);

      await expect(connectionService.sendRequest(1, 2)).rejects.toThrow(
        'Cannot connect with this user'
      );
    });
  });
});
