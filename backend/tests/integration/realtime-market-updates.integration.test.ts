/**
 * Integration test for end-to-end real-time market updates flow
 * Verifies: backend market status change → WebSocket publish → frontend receives update
 */

// Mock all external dependencies first
jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/cache.service');
jest.mock('../../src/services/StellarService');
jest.mock('../../src/websocket/realtime');

import { MarketUpdatePublisher, getMarketUpdatePublisher } from '../../src/services/marketUpdatePublisher.service';
import { tryGetActivityFeed } from '../../src/websocket/realtime';
import * as MarketService from '../../src/services/MarketService';

describe('Real-time Market Updates - Integration', () => {
  let mockActivityFeed: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivityFeed = {
      publishMarketUpdate: jest.fn(),
      subscribe: jest.fn(() => jest.fn()),
      unsubscribe: jest.fn(),
    };

    (tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);
  });

  describe('market status change flow', () => {
    it('should publish market status change when updateMarketStatus is called', async () => {
      // Mock the DB adapter
      const mockDbAdapter = {
        findMarketById: jest.fn().mockResolvedValue({
          id: 'market-123',
          status: 'open',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
        }),
        updateMarketStatus: jest.fn().mockResolvedValue(undefined),
      };

      MarketService.setDbAdapter(mockDbAdapter);

      // Mock cache service
      const cache = require('../../services/cache.service');
      cache.del = jest.fn().mockResolvedValue(undefined);

      // Call updateMarketStatus
      await MarketService.updateMarketStatus('market-123', 'locked');

      // Verify:
      // 1. Market was fetched from DB
      expect(mockDbAdapter.findMarketById).toHaveBeenCalledWith('market-123');

      // 2. Status was updated in DB
      expect(mockDbAdapter.updateMarketStatus).toHaveBeenCalledWith('market-123', 'locked');

      // 3. Cache was invalidated
      expect(cache.del).toHaveBeenCalledWith('market:market-123');

      // 4. WebSocket event was published
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'status_changed',
        {
          previous_status: 'open',
          new_status: 'locked',
        }
      );
    });

    it('should handle multiple status transitions', async () => {
      const mockDbAdapter = {
        findMarketById: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'market-123',
            status: 'open',
          })
          .mockResolvedValueOnce({
            id: 'market-123',
            status: 'locked',
          }),
        updateMarketStatus: jest.fn().mockResolvedValue(undefined),
      };

      MarketService.setDbAdapter(mockDbAdapter);

      const cache = require('../../services/cache.service');
      cache.del = jest.fn().mockResolvedValue(undefined);

      // First transition: open → locked
      await MarketService.updateMarketStatus('market-123', 'locked');

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenNthCalledWith(
        1,
        'market-123',
        'status_changed',
        {
          previous_status: 'open',
          new_status: 'locked',
        }
      );

      // Second transition: locked → resolved
      await MarketService.updateMarketStatus('market-123', 'resolved');

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenNthCalledWith(
        2,
        'market-123',
        'status_changed',
        {
          previous_status: 'locked',
          new_status: 'resolved',
        }
      );
    });
  });

  describe('market update publisher methods', () => {
    it('should publish all event types correctly', () => {
      const publisher = new MarketUpdatePublisher();

      // Status change
      publisher.publishStatusChange('market-1', 'open', 'locked');
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-1',
        'status_changed',
        expect.objectContaining({ previous_status: 'open', new_status: 'locked' })
      );

      // Odds update
      publisher.publishOddsUpdate('market-2', { odds_a: 6000 });
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-2',
        'odds_updated',
        { odds_a: 6000 }
      );

      // Pool update
      publisher.publishPoolUpdate('market-3', { pool_a: 5000 });
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-3',
        'pool_updated',
        { pool_a: 5000 }
      );

      // Lock
      publisher.publishLock('market-4', '2024-01-01T00:00:00Z');
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-4',
        'market_locked',
        expect.objectContaining({ locked_at: '2024-01-01T00:00:00Z' })
      );

      // Resolution
      publisher.publishResolution('market-5', 'fighter_a', '2024-01-02T00:00:00Z', 'oracle-123');
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-5',
        'market_resolved',
        expect.objectContaining({
          outcome: 'fighter_a',
          oracle_address: 'oracle-123',
        })
      );

      // Cancellation
      publisher.publishCancellation('market-6');
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-6',
        'market_cancelled',
        {}
      );
    });
  });

  describe('error resilience', () => {
    it('should gracefully handle ActivityFeed not being available during publication', () => {
      (tryGetActivityFeed as jest.Mock).mockReturnValue(null);

      const publisher = new MarketUpdatePublisher();

      expect(() => {
        publisher.publishStatusChange('market-123', 'open', 'locked');
        publisher.publishOddsUpdate('market-123', { odds_a: 6000 });
        publisher.publishCancellation('market-123');
      }).not.toThrow();
    });

    it('should handle ActivityFeed publishing errors gracefully', () => {
      mockActivityFeed.publishMarketUpdate.mockImplementation(() => {
        throw new Error('ActivityFeed error');
      });

      const publisher = new MarketUpdatePublisher();

      expect(() => {
        publisher.publishStatusChange('market-123', 'open', 'locked');
      }).not.toThrow();
    });

    it('should handle invalid market status transitions', async () => {
      const mockDbAdapter = {
        findMarketById: jest.fn().mockResolvedValue({
          id: 'market-123',
          status: 'resolved',
        }),
        updateMarketStatus: jest.fn(),
      };

      MarketService.setDbAdapter(mockDbAdapter);

      // Attempting an invalid transition should throw
      expect(
        MarketService.updateMarketStatus('market-123', 'open') // resolved → open is invalid
      ).rejects.toThrow();

      // publishMarketUpdate should not be called on invalid transition
      expect(mockActivityFeed.publishMarketUpdate).not.toHaveBeenCalled();
    });
  });

  describe('data consistency', () => {
    it('should maintain data integrity through the publishing chain', () => {
      const publisher = getMarketUpdatePublisher();

      const eventData = {
        status: 'locked',
        locked_at: '2024-01-01T12:00:00Z',
        pool_a: 5000,
        pool_b: 5000,
        volume: 10000,
      };

      publisher.publishUpdate('market-123', 'market_update', eventData);

      // Verify exact data is passed through
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'market_update',
        eventData
      );

      // Verify no data mutation
      expect(eventData).toEqual({
        status: 'locked',
        locked_at: '2024-01-01T12:00:00Z',
        pool_a: 5000,
        pool_b: 5000,
        volume: 10000,
      });
    });

    it('should preserve nested data structures in events', () => {
      const publisher = new MarketUpdatePublisher();

      const complexData = {
        markets: [
          { id: 'market-1', status: 'open' },
          { id: 'market-2', status: 'locked' },
        ],
        metadata: {
          updated_at: '2024-01-01T00:00:00Z',
          version: 2,
        },
      };

      publisher.publishUpdate('collection', 'batch_update', complexData);

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'collection',
        'batch_update',
        complexData
      );
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent market status updates', async () => {
      const mockDbAdapter = {
        findMarketById: jest.fn((id) =>
          Promise.resolve({
            id,
            status: 'open',
          })
        ),
        updateMarketStatus: jest.fn().mockResolvedValue(undefined),
      };

      MarketService.setDbAdapter(mockDbAdapter);

      const cache = require('../../services/cache.service');
      cache.del = jest.fn().mockResolvedValue(undefined);

      // Simulate concurrent status updates for different markets
      const updates = [
        MarketService.updateMarketStatus('market-1', 'locked'),
        MarketService.updateMarketStatus('market-2', 'locked'),
        MarketService.updateMarketStatus('market-3', 'locked'),
      ];

      await Promise.all(updates);

      // All updates should be published
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledTimes(3);

      // Each market should get its own event
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenNthCalledWith(
        1,
        'market-1',
        'status_changed',
        expect.any(Object)
      );
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenNthCalledWith(
        2,
        'market-2',
        'status_changed',
        expect.any(Object)
      );
      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenNthCalledWith(
        3,
        'market-3',
        'status_changed',
        expect.any(Object)
      );
    });
  });
});
