import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { redis } from '../services/cache.service';
import { consumeSlidingWindow } from '../services/sliding-window-limiter';
import { AppError } from '../utils/AppError';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyBy: 'ip' | 'userId' | 'global';
  scope?: 'route' | 'global';
}

export function rateLimit(opts: RateLimitOptions) {
  if (!Number.isInteger(opts.windowMs) || opts.windowMs <= 0) {
    throw new RangeError('Rate limit windowMs must be a positive integer');
  }
  if (!Number.isInteger(opts.max) || opts.max <= 0) {
    throw new RangeError('Rate limit max must be a positive integer');
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as Request & {
      userId?: string;
      user?: { id?: string; userId?: string };
    };
    const id =
      opts.keyBy === 'global'
        ? undefined
        : opts.keyBy === 'userId'
          ? authenticatedReq.userId ??
            authenticatedReq.user?.userId ??
            authenticatedReq.user?.id ??
            req.ip
          : req.ip;
    const key =
      opts.keyBy === 'global'
        ? 'rl:global'
        : opts.scope === 'global'
          ? `rl:${opts.keyBy}:${id}`
          : `rl:${req.path}:${id}`;

    try {
      const result = await consumeSlidingWindow(
        redis,
        key,
        opts.windowMs,
        opts.max,
        randomUUID(),
      );
      const resetAt = Math.ceil(result.resetAt / 1000);
      const resetAfter = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
      const remaining = result.allowed ? Math.max(0, opts.max - result.count) : 0;

      res.set({
        'RateLimit-Limit': String(opts.max),
        'RateLimit-Remaining': String(remaining),
        'RateLimit-Reset': String(resetAfter),
        'X-RateLimit-Limit': String(opts.max),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(resetAt),
      });

      if (!result.allowed) {
        res.set('Retry-After', String(Math.max(1, resetAfter)));
        next(new AppError(429, 'Too Many Requests'));
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export const authenticatedUserRateLimit = rateLimit({
  windowMs: 60_000,
  max: 100,
  keyBy: 'userId',
  scope: 'global',
});
