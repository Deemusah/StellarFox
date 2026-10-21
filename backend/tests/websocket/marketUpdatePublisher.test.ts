/**
 * Tests for MarketUpdatePublisher service
 * Verifies market update event publishing via WebSocket
 */

// Mock the realtime module before importing the service
jest.mock('../../src/websocket/realtime');

import { MarketUpdatePublisher, getMarketUpdatePublisher } from '../../src/services/marketUpdatePublisher.service';
import * as realtimeModule from '../../src/websocket/realtime';

describe('MarketUpdatePublisher', () => {
  let mockActivityFeed: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockActivityFeed = {
      publishMarketUpdate: jest.fn(),
    };
  });

  describe('singleton pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getMarketUpdatePublisher();
      const instance2 = getMarketUpdatePublisher();

      expect(instance1).toBe(instance2);
    });
  });

  describe('publishStatusChange', () => {
    it('should publish status change event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishStatusChange('market-123', 'open', 'locked', { locked_at: '2024-01-01T00:00:00Z' });

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'status_changed',
        {
          previous_status: 'open',
          new_status: 'locked',
          locked_at: '2024-01-01T00:00:00Z',
        }
      );
    });

    it('should handle status transitions without additional data', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishStatusChange('market-456', 'locked', 'resolved');

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-456',
        'status_changed',
        {
          previous_status: 'locked',
          new_status: 'resolved',
        }
      );
    });
  });

  describe('publishOddsUpdate', () => {
    it('should publish odds update event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishOddsUpdate('market-123', {
        odds_a: 6000,
        odds_b: 4000,
      });

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'odds_updated',
        {
          odds_a: 6000,
          odds_b: 4000,
        }
      );
    });

    it('should handle partial odds updates', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishOddsUpdate('market-123', { odds_a: 5500 });

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'odds_updated',
        { odds_a: 5500 }
      );
    });
  });

  describe('publishPoolUpdate', () => {
    it('should publish pool update event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishPoolUpdate('market-123', {
        pool_a: 2000,
        pool_b: 1500,
        pool_draw: 500,
      });

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'pool_updated',
        {
          pool_a: 2000,
          pool_b: 1500,
          pool_draw: 500,
        }
      );
    });
  });

  describe('publishLock', () => {
    it('should publish lock event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      const lockTime = '2024-01-01T12:00:00Z';
      publisher.publishLock('market-123', lockTime);

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'market_locked',
        { locked_at: lockTime }
      );
    });
  });

  describe('publishResolution', () => {
    it('should publish resolution event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishResolution(
        'market-123',
        'fighter_a',
        '2024-01-02T00:00:00Z',
        'oracle-address-xyz'
      );

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'market_resolved',
        {
          outcome: 'fighter_a',
          resolved_at: '2024-01-02T00:00:00Z',
          oracle_address: 'oracle-address-xyz',
        }
      );
    });
  });

  describe('publishCancellation', () => {
    it('should publish cancellation event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishCancellation('market-123');

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'market_cancelled',
        {}
      );
    });
  });

  describe('publishUpdate', () => {
    it('should publish generic update event', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      publisher.publishUpdate('market-123', 'custom_event', {
        custom_field: 'custom_value',
        number_field: 42,
      });

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'custom_event',
        {
          custom_field: 'custom_value',
          number_field: 42,
        }
      );
    });
  });

  describe('error handling', () => {
    it('should handle missing ActivityFeed gracefully', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(null);

      const publisher = new MarketUpdatePublisher();
      expect(() => {
        publisher.publishStatusChange('market-123', 'open', 'locked');
      }).not.toThrow();

      expect(mockActivityFeed.publishMarketUpdate).not.toHaveBeenCalled();
    });

    it('should handle ActivityFeed errors gracefully', () => {
      const error = new Error('ActivityFeed error');
      mockActivityFeed.publishMarketUpdate.mockImplementation(() => {
        throw error;
      });
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      expect(() => {
        publisher.publishStatusChange('market-123', 'open', 'locked');
      }).not.toThrow();
    });
  });

  describe('market ID handling', () => {
    it('should handle various market ID formats', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      const marketIds = [
        'market-123',
        'abc-def-ghi',
        '550e8400-e29b-41d4-a716-446655440000',
      ];

      for (const marketId of marketIds) {
        publisher.publishUpdate(marketId, 'test_event', {});
        expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
          marketId,
          'test_event',
          {}
        );
      }
    });
  });

  describe('data integrity', () => {
    it('should preserve all fields in event data', () => {
      (realtimeModule.tryGetActivityFeed as jest.Mock).mockReturnValue(mockActivityFeed);

      const publisher = new MarketUpdatePublisher();
      const eventData = {
        field1: 'value1',
        field2: 123,
        field3: true,
        nested: { subfield: 'subvalue' },
      };

      publisher.publishUpdate('market-123', 'test_event', eventData);

      expect(mockActivityFeed.publishMarketUpdate).toHaveBeenCalledWith(
        'market-123',
        'test_event',
        eventData
      );
    });
  });
});
