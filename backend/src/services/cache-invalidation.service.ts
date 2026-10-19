// ============================================================
// BANKERCHANGER — Cache Invalidation Service
// Provides targeted invalidation helpers for market data caches.
// All operations use delPattern so wildcard patterns work correctly.
// ============================================================

import * as cache from './cache.service';
import { logger } from '../utils/logger';

/**
 * Invalidate all cache entries related to a specific market.
 *
 * Deletes:
 *  - `market:{marketId}`          — single-market detail
 *  - `market:{marketId}:*`        — stats, odds, and any sub-keys
 *  - `markets:list:*`             — all paginated list snapshots
 */
export async function invalidateMarket(marketId: string): Promise<void> {
  logger.info({ marketId }, 'cache-invalidation: invalidating market');

  await Promise.all([
    cache.del(`market:${marketId}`),
    cache.delPattern(`market:${marketId}:*`),
    cache.delPattern('markets:list:*'),
  ]);
}

/**
 * Invalidate the platform-wide statistics cache entry.
 *
 * Deletes:
 *  - `platform:stats`
 */
export async function invalidatePlatformStats(): Promise<void> {
  logger.info('cache-invalidation: invalidating platform stats');

  await cache.del('platform:stats');
}

/**
 * Invalidate all market-related cache entries across the entire platform.
 *
 * Deletes:
 *  - `market:*`         — all individual market keys and sub-keys
 *  - `markets:list:*`   — all paginated list snapshots
 */
export async function invalidateAllMarkets(): Promise<void> {
  logger.info('cache-invalidation: invalidating all markets');

  await Promise.all([
    cache.delPattern('market:*'),
    cache.delPattern('markets:list:*'),
  ]);
}
