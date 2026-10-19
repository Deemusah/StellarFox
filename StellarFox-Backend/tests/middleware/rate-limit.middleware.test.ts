import type { Request, Response, NextFunction } from 'express';
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import type { SlidingWindowResult } from '../../src/services/sliding-window-limiter';

const mockConsumeSlidingWindow = jest.fn<() => Promise<SlidingWindowResult>>();

jest.mock('../../src/services/sliding-window-limiter', () => ({
  consumeSlidingWindow: mockConsumeSlidingWindow,
}));

jest.mock('../../src/services/cache.service', () => ({
  redis: {},
}));

import { rateLimit } from '../../src/middleware/rate-limit.middleware';
import { AppError } from '../../src/utils/AppError';

function makeReqRes(ip = '1.2.3.4', path = '/auth/login') {
  const req = { ip, path, user: undefined } as unknown as Request;
  const mockSet = jest.fn().mockReturnThis();
  const res = { set: mockSet } as unknown as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next, mockSet };
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsumeSlidingWindow.mockResolvedValue({
      allowed: true,
      count: 1,
      resetAt: Date.now() + 60_000,
    });
  });

  it('allows requests below the limit and sets rate limit headers', async () => {
    const { req, res, next, mockSet } = makeReqRes();
    await rateLimit({ windowMs: 60_000, max: 2, keyBy: 'ip' })(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        'RateLimit-Limit': '2',
        'RateLimit-Remaining': '1',
        'X-RateLimit-Limit': '2',
        'X-RateLimit-Remaining': '1',
      }),
    );
  });

  it('rejects requests over the limit and includes retry/reset headers', async () => {
    mockConsumeSlidingWindow.mockResolvedValue({
      allowed: false,
      count: 2,
      resetAt: Date.now() + 50_000,
    });
    const { req, res, next, mockSet } = makeReqRes();
    await rateLimit({ windowMs: 60_000, max: 2, keyBy: 'ip' })(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0]).toMatchObject({
      statusCode: 429,
      message: 'Too Many Requests',
    });
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        'RateLimit-Remaining': '0',
        'X-RateLimit-Remaining': '0',
      }),
    );
    expect(mockSet).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('uses the authenticated user ID for per-user quotas', async () => {
    const { req, res, next } = makeReqRes();
    (req as Request & { userId?: string }).userId = 'user-42';
    await rateLimit({ windowMs: 60_000, max: 100, keyBy: 'userId', scope: 'global' })(
      req,
      res,
      next,
    );

    expect(mockConsumeSlidingWindow).toHaveBeenCalledWith(
      expect.any(Object),
      'rl:userId:user-42',
      60_000,
      100,
      expect.any(String),
    );
  });

  it('falls back to the request IP when no authenticated user is available', async () => {
    const { req, res, next } = makeReqRes('9.9.9.9');
    await rateLimit({ windowMs: 60_000, max: 2, keyBy: 'userId' })(req, res, next);

    expect(mockConsumeSlidingWindow).toHaveBeenCalledWith(
      expect.any(Object),
      'rl:/auth/login:9.9.9.9',
      60_000,
      2,
      expect.any(String),
    );
  });

  it('uses one shared key for the global service-wide quota', async () => {
    const { req, res, next } = makeReqRes();
    await rateLimit({ windowMs: 60_000, max: 10_000, keyBy: 'global' })(req, res, next);

    expect(mockConsumeSlidingWindow).toHaveBeenCalledWith(
      expect.any(Object),
      'rl:global',
      60_000,
      10_000,
      expect.any(String),
    );
  });

  it('allows requests again when the sliding window has expired', async () => {
    mockConsumeSlidingWindow.mockResolvedValue({
      allowed: true,
      count: 1,
      resetAt: Date.now() + 60_000,
    });
    const { req, res, next } = makeReqRes();
    await rateLimit({ windowMs: 60_000, max: 2, keyBy: 'ip' })(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('forwards Redis failures to Express error handling', async () => {
    const redisError = new Error('Redis unavailable');
    mockConsumeSlidingWindow.mockRejectedValue(redisError);
    const { req, res, next } = makeReqRes();
    await rateLimit({ windowMs: 60_000, max: 2, keyBy: 'ip' })(req, res, next);

    expect(next).toHaveBeenCalledWith(redisError);
  });

  it('rejects invalid limit configuration', () => {
    expect(() => rateLimit({ windowMs: 0, max: 2, keyBy: 'ip' })).toThrow(RangeError);
    expect(() => rateLimit({ windowMs: 1.5, max: 2, keyBy: 'ip' })).toThrow(RangeError);
    expect(() => rateLimit({ windowMs: 60_000, max: 0, keyBy: 'ip' })).toThrow(RangeError);
  });
});
