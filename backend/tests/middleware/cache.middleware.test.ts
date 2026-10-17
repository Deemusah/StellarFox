// ============================================================
// BANKERCHANGER — Cache Middleware Tests
// Tests for cache-aside Express middleware behaviour:
//   - Cache HIT path
//   - Cache MISS path
//   - Redis failure graceful fallthrough
//   - Pre-configured helper key generation
// ============================================================

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

// ----------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ----------------------------------------------------------------

const mockCacheGet = jest.fn<() => Promise<unknown>>();
const mockCacheSet = jest.fn<() => Promise<void>>();

jest.mock('../../src/services/cache.service', () => ({
  get: mockCacheGet,
  set: mockCacheSet,
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks are in place
import {
  cacheMiddleware,
  cacheMarket,
  cacheMarketList,
  cacheMarketStats,
  cachePlatformStats,
} from '../../src/middleware/cache.middleware';

// ----------------------------------------------------------------
// Test helpers
// ----------------------------------------------------------------

function makeReqRes(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  originalUrl?: string;
} = {}) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    originalUrl: overrides.originalUrl ?? '/markets',
  } as unknown as Request;

  const jsonMock = jest.fn<Response['json']>().mockReturnThis();
  const setHeaderMock = jest.fn<Response['setHeader']>().mockReturnThis();
  const statusMock = jest.fn<Response['status']>().mockReturnThis();

  const res = {
    json: jsonMock,
    setHeader: setHeaderMock,
    status: statusMock,
  } as unknown as Response;

  // Make status() return the same res so res.status(200).json() works
  (res.status as jest.Mock).mockReturnValue(res);

  const next = jest.fn() as unknown as NextFunction;

  return { req, res, next, jsonMock, setHeaderMock, statusMock };
}

// ----------------------------------------------------------------
// Tests
// ----------------------------------------------------------------

describe('cacheMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------
  // Cache HIT
  // ------------------------------------------------------------
  describe('Cache HIT', () => {
    const cachedData = { id: '42', name: 'Test Market' };

    beforeEach(() => {
      mockCacheGet.mockResolvedValue(cachedData);
    });

    it('sets X-Cache: HIT header', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    });

    it('responds with status 200 and cached data', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(cachedData);
    });

    it('does NOT call next()', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
    });

    it('does NOT call cache.set', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(mockCacheSet).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------
  // Cache MISS
  // ------------------------------------------------------------
  describe('Cache MISS', () => {
    const responseBody = { id: '7', status: 'open' };

    beforeEach(() => {
      mockCacheGet.mockResolvedValue(null);
      mockCacheSet.mockResolvedValue(undefined);
    });

    it('sets X-Cache: MISS header', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
    });

    it('calls next() to proceed to the route handler', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(/* no error */);
    });

    it('caches the response body when res.json is called downstream', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      // Simulate downstream handler calling res.json
      res.json(responseBody);

      // Allow promise microtasks (cache.set is fire-and-forget)
      await Promise.resolve();

      expect(mockCacheSet).toHaveBeenCalledWith('test:key', responseBody, 30);
    });

    it('calls the original res.json with the response body', async () => {
      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next, jsonMock } = makeReqRes();

      await middleware(req, res, next);
      res.json(responseBody);

      expect(jsonMock).toHaveBeenCalledWith(responseBody);
    });
  });

  // ------------------------------------------------------------
  // Redis failure — graceful fallthrough
  // ------------------------------------------------------------
  describe('Redis failure', () => {
    it('calls next() and proceeds normally when cache.get throws', async () => {
      mockCacheGet.mockRejectedValue(new Error('Redis connection refused'));

      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      // Should fall through to route handler
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(/* no error */);
      // Should NOT have attempted to send a response
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('does not set any X-Cache header when Redis is unavailable on GET', async () => {
      mockCacheGet.mockRejectedValue(new Error('ECONNREFUSED'));

      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next } = makeReqRes();

      await middleware(req, res, next);

      expect(res.setHeader).not.toHaveBeenCalledWith('X-Cache', expect.any(String));
    });

    it('swallows cache.set errors and still delivers the response', async () => {
      mockCacheGet.mockResolvedValue(null);
      mockCacheSet.mockRejectedValue(new Error('Redis write error'));

      const middleware = cacheMiddleware(() => 'test:key', 30);
      const { req, res, next, jsonMock } = makeReqRes();

      await middleware(req, res, next);

      // Simulate downstream handler calling res.json — should not throw
      expect(() => res.json({ data: 'payload' })).not.toThrow();

      await Promise.resolve(); // flush microtasks for the fire-and-forget set

      // Original json was still called
      expect(jsonMock).toHaveBeenCalledWith({ data: 'payload' });
    });
  });
});

// ----------------------------------------------------------------
// Pre-configured helpers — key generation
// ----------------------------------------------------------------

describe('cacheMarket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('generates key `market:{market_id}` from req.params', async () => {
    const middleware = cacheMarket(30);
    const { req, res, next } = makeReqRes({ params: { market_id: '123' } });

    await middleware(req, res, next);

    expect(mockCacheGet).toHaveBeenCalledWith('market:123');
  });

  it('uses default TTL of 30 seconds when caching the response', async () => {
    const middleware = cacheMarket(); // default ttl
    const { req, res, next } = makeReqRes({ params: { market_id: '99' } });

    await middleware(req, res, next);
    res.json({ market: 'data' });

    await Promise.resolve();

    expect(mockCacheSet).toHaveBeenCalledWith('market:99', expect.anything(), 30);
  });

  it('respects a custom TTL', async () => {
    const middleware = cacheMarket(15);
    const { req, res, next } = makeReqRes({ params: { market_id: '5' } });

    await middleware(req, res, next);
    res.json({ market: 'data' });

    await Promise.resolve();

    expect(mockCacheSet).toHaveBeenCalledWith('market:5', expect.anything(), 15);
  });
});

describe('cacheMarketList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
  });

  it('generates a key with an md5 hash of the query string', async () => {
    const qs = 'status=open&page=1&limit=20';
    const expectedHash = createHash('md5').update(qs).digest('hex');
    const middleware = cacheMarketList(10);

    const { req, res, next } = makeReqRes({
      originalUrl: `/markets?${qs}`,
    });

    await middleware(req, res, next);

    expect(mockCacheGet).toHaveBeenCalledWith(`markets:list:${expectedHash}`);
  });

  it('uses an empty string hash when there is no query string', async () => {
    const expectedHash = createHash('md5').update('').digest('hex');
    const middleware = cacheMarketList(10);

    const { req, res, next } = makeReqRes({ originalUrl: '/markets' });

    await middleware(req, res, next);

    expect(mockCacheGet).toHaveBeenCalledWith(`markets:list:${expectedHash}`);
  });

  it('uses default TTL of 10 seconds', async () => {
    const middleware = cacheMarketList();
    const { req, res, next } = makeReqRes({ originalUrl: '/markets?status=open' });

    await middleware(req, res, next);
    res.json([]);

    await Promise.resolve();

    expect(mockCacheSet).toHaveBeenCalledWith(expect.stringContaining('markets:list:'), expect.anything(), 10);
  });
});

describe('cacheMarketStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('generates key `market:{market_id}:stats` from req.params', async () => {
    const middleware = cacheMarketStats(60);
    const { req, res, next } = makeReqRes({ params: { market_id: '77' } });

    await middleware(req, res, next);

    expect(mockCacheGet).toHaveBeenCalledWith('market:77:stats');
  });
});

describe('cachePlatformStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGet.mockResolvedValue(null);
  });

  it('generates key `platform:stats` regardless of request', async () => {
    const middleware = cachePlatformStats(60);
    const { req, res, next } = makeReqRes();

    await middleware(req, res, next);

    expect(mockCacheGet).toHaveBeenCalledWith('platform:stats');
  });
});
