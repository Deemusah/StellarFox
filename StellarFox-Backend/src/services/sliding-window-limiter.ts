import type Redis from 'ioredis';
import { logger } from '../utils/logger';

const SLIDING_WINDOW_SCRIPT = `
local time = redis.call('TIME')
local now = time[1] * 1000 + math.floor(time[2] / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local cutoff = now - window

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', cutoff)
local count = redis.call('ZCARD', KEYS[1])
local allowed = 0

if count < limit then
  redis.call('ZADD', KEYS[1], now, ARGV[3])
  count = count + 1
  allowed = 1
  redis.call('PEXPIRE', KEYS[1], window)
end

local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
local resetAt = now + window
if oldest[2] then
  resetAt = tonumber(oldest[2]) + window
end

return { allowed, count, resetAt }
`;

export interface SlidingWindowResult {
  allowed: boolean;
  count: number;
  resetAt: number;
}

export async function consumeSlidingWindow(
  redis: Redis,
  key: string,
  windowMs: number,
  max: number,
  member: string,
): Promise<SlidingWindowResult> {
  try {
    const result = await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      windowMs,
      max,
      member,
    );

    if (!Array.isArray(result) || result.length !== 3) {
      throw new Error('Redis returned an invalid sliding-window result');
    }

    const allowed = Number(result[0]);
    const count = Number(result[1]);
    const resetAt = Number(result[2]);
    if (
      (allowed !== 0 && allowed !== 1) ||
      !Number.isInteger(count) ||
      count < 0 ||
      !Number.isFinite(resetAt)
    ) {
      throw new Error('Redis returned an invalid sliding-window result');
    }

    return {
      allowed: allowed === 1,
      count,
      resetAt,
    };
  } catch (err) {
    logger.error({ err, key, windowMs, max }, 'consumeSlidingWindow: Redis Lua script failed');
    throw err;
  }
}
