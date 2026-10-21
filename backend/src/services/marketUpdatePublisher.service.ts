/**
 * Market Update Publisher Service
 * 
 * Bridges market state changes to the WebSocket layer, publishing real-time
 * market_update events to subscribed clients.
 * 
 * Usage:
 *   const publisher = new MarketUpdatePublisher();
 *   publisher.publishStatusChange('market-123', 'open', 'locked', { locked_at: '2024...' });
 */

import { tryGetActivityFeed } from '../websocket/realtime';
import { logger } from '../utils/logger';

export interface MarketUpdateEvent {
  type: 'market_update';
  marketId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Publishes market state changes to WebSocket subscribers.
 * Handles failures gracefully (WebSocket may not be initialized yet).
 */
export class MarketUpdatePublisher {
  /**
   * Publish a market status change
   */
  publishStatusChange(
    marketId: string,
    previousStatus: string,
    newStatus: string,
    additionalData?: Record<string, unknown>,
  ): void {
    this.publishUpdate(
      marketId,
      'status_changed',
      {
        previous_status: previousStatus,
        new_status: newStatus,
        ...additionalData,
      },
    );
  }

  /**
   * Publish market odds/prices update
   */
  publishOddsUpdate(
    marketId: string,
    odds: {
      odds_a?: number;
      odds_b?: number;
      odds_draw?: number;
    },
  ): void {
    this.publishUpdate(marketId, 'odds_updated', odds);
  }

  /**
   * Publish market pool update (bet volumes changed)
   */
  publishPoolUpdate(
    marketId: string,
    pools: {
      pool_a?: number;
      pool_b?: number;
      pool_draw?: number;
    },
  ): void {
    this.publishUpdate(marketId, 'pool_updated', pools);
  }

  /**
   * Publish market lock event
   */
  publishLock(marketId: string, lockedAt: string): void {
    this.publishUpdate(marketId, 'market_locked', { locked_at: lockedAt });
  }

  /**
   * Publish market resolution event
   */
  publishResolution(
    marketId: string,
    outcome: string,
    resolvedAt: string,
    oracleAddress: string,
  ): void {
    this.publishUpdate(marketId, 'market_resolved', {
      outcome,
      resolved_at: resolvedAt,
      oracle_address: oracleAddress,
    });
  }

  /**
   * Publish market cancellation event
   */
  publishCancellation(marketId: string): void {
    this.publishUpdate(marketId, 'market_cancelled', {});
  }

  /**
   * Publish a generic market update event
   */
  publishUpdate(
    marketId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    try {
      const feed = tryGetActivityFeed();
      if (!feed) {
        // WebSocket not initialized yet, skip silently
        return;
      }

      feed.publishMarketUpdate(marketId, eventType, data);
    } catch (error) {
      logger.warn(
        { error, marketId, eventType },
        'Failed to publish market update',
      );
    }
  }
}

// Singleton instance
let _publisher: MarketUpdatePublisher | null = null;

/**
 * Get the singleton market update publisher
 */
export function getMarketUpdatePublisher(): MarketUpdatePublisher {
  if (!_publisher) {
    _publisher = new MarketUpdatePublisher();
  }
  return _publisher;
}

export default MarketUpdatePublisher;
