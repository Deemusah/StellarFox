import type Redis from 'ioredis';
import { describe, it, expect, jest } from '@jest/globals';
import { consumeSlidingWindow } from '../../src/services/sliding-window-limiter';

const mockEval = jest.fn<
  (
    script: string,
    numberOfKeys: number,
    key: string,
    windowMs: number,
    max: number,
    member: string,
  ) => Promise<unknown>
>();
const mockRedis = { eval: mockEval } as unknown as Redis;

describe('consumeSlidingWindow', () => {
  it('atomically removes expired requests, checks the count, and returns reset time', async () => {
    const resetAt = Date.now() + 60_000;
    mockEval.mockResolvedValue([1, 1, resetAt]);

    await expect(
      consumeSlidingWindow(mockRedis, 'rl:test', 60_000, 2, 'request-1'),
    ).resolves.toEqual({ allowed: true, count: 1, resetAt });

    const [script, numberOfKeys, key, windowMs, max, member] = mockEval.mock.calls[0];
    expect(script).toContain('ZREMRANGEBYSCORE');
    expect(script).toContain('ZCARD');
    expect(script).toContain('ZADD');
    expect(script).toContain('tonumber(oldest[2]) + window');
    expect(numberOfKeys).toBe(1);
    expect(key).toBe('rl:test');
    expect(windowMs).toBe(60_000);
    expect(max).toBe(2);
    expect(member).toBe('request-1');
  });

  it('rejects invalid results and Redis errors instead of allowing requests', async () => {
    mockEval.mockResolvedValue([2, 3, 123]);
    await expect(
      consumeSlidingWindow(mockRedis, 'rl:test', 60_000, 2, 'request-1'),
    ).rejects.toThrow('invalid sliding-window result');

    const redisError = new Error('Redis unavailable');
    mockEval.mockRejectedValue(redisError);
    await expect(
      consumeSlidingWindow(mockRedis, 'rl:test', 60_000, 2, 'request-1'),
    ).rejects.toBe(redisError);
  });
});
