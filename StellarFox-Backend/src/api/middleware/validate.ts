import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

type Target = 'body' | 'params' | 'query';

function formatErrors(err: ZodError) {
  return err.issues.map((e: ZodIssue) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
}

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      res.status(422).json({ errors: formatErrors(result.error) });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}

// Convenience aliases kept for backward compatibility
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  maxPerUser?: number;
  keyGenerator?: (req: Request) => string;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_IP = 100;
const DEFAULT_MAX_PER_USER = 300;

const buckets = new Map<string, RateLimitEntry>();

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function defaultKey(req: Request): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (req as any).user;
  if (user && (user.id || user.sub)) {
    return `user:${user.id ?? user.sub}`;
  }
  return `ip:${clientIp(req)}`;
}

function consume(key: string, max: number, windowMs: number): RateLimitEntry {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh: RateLimitEntry = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

/**
 * Ingress-level rate limiting middleware.
 * Enforces per-IP and per-user limits and responds with HTTP 429
 * plus a Retry-After header when a limit is exceeded.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxPerIp = options.max ?? DEFAULT_MAX_PER_IP;
  const maxPerUser = options.maxPerUser ?? DEFAULT_MAX_PER_USER;
  const keyGenerator = options.keyGenerator ?? defaultKey;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const isUser = key.startsWith('user:');
    const max = isUser ? maxPerUser : maxPerIp;

    const entry = consume(key, max, windowMs);
    const remaining = Math.max(0, max - entry.count);
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please retry later.',
        retryAfter,
      });
      return;
    }

    next();
  };
}

export const ingressRateLimit = rateLimit();
