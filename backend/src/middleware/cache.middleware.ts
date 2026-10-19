// ============================================================
// BANKERCHANGER — Cache Middleware
// Cache-aside Express middleware for market data endpoints.
// On HIT: returns cached response with X-Cache: HIT header.
// On MISS: intercepts response, caches it, sets X-Cache: MISS.
// On Redis failure: gracefully falls through (no-op).
// ============================================================

import { createHash } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import * as cache from '../services/cache.service';
import { logger } from '../utils/logger';

/**
 * Factory function that returns an Express middleware implementing cache-aside logic.
 *
 * @param keyFn - Function that derives the cache key from the incoming request.
 * @param ttl   - Time-to-live in seconds for cached entries.
 */
export function cacheMiddleware(keyFn: (req: Request) => string, ttl: number): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = keyFn(req);

    // ----------------------------------------------------------------
    // Cache lookup — fall through on any Redis error
    // ----------------------------------------------------------------
    let cached: unknown;
    try {
      cached = await cache.get(key);
    } catch (err) {
      logger.warn({ err, key }, 'cacheMiddleware: Redis unavailable on GET, falling through');
      next();
      return;
    }

    if (cached !== null && cached !== undefined) {
      // Cache HIT — respond immediately
      logger.debug({ key }, 'cacheMiddleware: HIT');
      res.setHeader('X-Cache', 'HIT');
      res.status(200).json(cached);
      return;
    }

    // ----------------------------------------------------------------
    // Cache MISS — intercept res.json to capture and store the response
    // ----------------------------------------------------------------
    logger.debug({ key }, 'cacheMiddleware: MISS');
    res.setHeader('X-Cache', 'MISS');

    // Save reference to the original json method
    const originalJson = res.json.bind(res);

    // Override res.json so we can intercept the response body
    res.json = function (body: unknown): Response {
      // Restore original immediately to avoid re-entry issues
      res.json = originalJson;

      // Fire-and-forget: cache the response body; errors are swallowed gracefully
      cache.set(key, body, ttl).catch((err: unknown) => {
        logger.warn({ err, key }, 'cacheMiddleware: Redis unavailable on SET, skipping cache write');
      });

      return originalJson(body);
    };

    next();
  };
}

// ============================================================
// Pre-configured helpers
// ============================================================

/**
 * Cache middleware for a single market.
 * Key: `market:{market_id}`
 * Default TTL: 30 seconds
 */
export function cacheMarket(ttl = 30): RequestHandler {
  return cacheMiddleware((req: Request) => `market:${req.params.market_id}`, ttl);
}

/**
 * Cache middleware for the market list.
 * Key: `markets:list:{md5(querystring)}`
 * Default TTL: 10 seconds
 */
export function cacheMarketList(ttl = 10): RequestHandler {
  return cacheMiddleware((req: Request) => {
    const qs = req.originalUrl.includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1)
      : '';
    const hash = createHash('md5').update(qs).digest('hex');
    return `markets:list:${hash}`;
  }, ttl);
}

/**
 * Cache middleware for market statistics.
 * Key: `market:{market_id}:stats`
 * Default TTL: 60 seconds
 */
export function cacheMarketStats(ttl = 60): RequestHandler {
  return cacheMiddleware((req: Request) => `market:${req.params.market_id}:stats`, ttl);
}

/**
 * Cache middleware for platform-wide statistics.
 * Key: `platform:stats`
 * Default TTL: 60 seconds
 */
export function cachePlatformStats(ttl = 60): RequestHandler {
  return cacheMiddleware((_req: Request) => 'platform:stats', ttl);
}
