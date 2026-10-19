/**
 * Performance monitoring middleware
 *
 * 1. `httpMetrics` — Records request duration (Prometheus histogram/counter)
 *    using `req.route?.path` for clean route labels (e.g. `/api/markets/:market_id`)
 *    instead of the resolved URL. Falls back to a sanitised `req.path` to avoid
 *    high-cardinality labels from dynamic segments.
 *
 * 2. `slowRequestLogger` — Logs any request whose total processing time exceeds
 *    SLOW_REQUEST_THRESHOLD_MS.  Must be mounted BEFORE routes.
 *
 * 3. `requestTimeout` — Sends a 503 response if a handler has not responded
 *    within the given number of milliseconds. Prevents hung requests from
 *    exhausting the connection pool.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import {
  httpRequestDuration,
  httpRequestsTotal,
  slowRequestsTotal,
  SLOW_REQUEST_THRESHOLD_MS,
} from '../services/metrics.service';

// ── Route-label helpers ───────────────────────────────────────────────────────

/**
 * Return a stable route label for Prometheus.
 *
 * Preference order:
 *   1. `req.route.path`  — the Express pattern string (e.g. `/:market_id`)
 *      combined with the router base already present on the request.
 *   2. Sanitised `req.path` — IDs replaced with `:id` so cardinality stays low.
 *
 * The sanitisation regex replaces common dynamic segments:
 *   - UUIDs
 *   - Pure integers
 *   - Stellar G… public keys (56-character alphanumeric)
 */
function routeLabel(req: Request): string {
  // Express populates req.route after a handler is matched.
  if (req.route?.path) {
    const base = (req as any).baseUrl ?? '';
    return base + req.route.path;
  }

  // Fallback: normalise dynamic segments so we don't create per-ID label rows.
  return req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/G[A-Z0-9]{55}/g, '/:address')
    .replace(/\/\d+/g, '/:id');
}

// ── HTTP metrics middleware ───────────────────────────────────────────────────

/**
 * Records Prometheus HTTP metrics.
 *
 * Mount BEFORE all route handlers so the timer starts at the earliest
 * possible moment.  The `finish` event fires after headers have been sent.
 */
export function httpMetrics(req: Request, res: Response, next: NextFunction): void {
  const endTimer = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route = routeLabel(req);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    endTimer(labels);
    httpRequestsTotal.inc(labels);
  });

  next();
}

// ── Slow-request logger ───────────────────────────────────────────────────────

/**
 * Logs a warning and increments the slow-requests counter for any request
 * that takes longer than SLOW_REQUEST_THRESHOLD_MS milliseconds.
 *
 * Mount BEFORE all route handlers.
 */
export function slowRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      const route = routeLabel(req);
      slowRequestsTotal.inc({ method: req.method, route });
      logger.warn(
        {
          method: req.method,
          route,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          thresholdMs: SLOW_REQUEST_THRESHOLD_MS,
        },
        `Slow request detected: ${req.method} ${req.path} took ${durationMs}ms`,
      );
    }
  });

  next();
}

// ── Request timeout middleware ────────────────────────────────────────────────

/**
 * Enforce a maximum response time per request.
 *
 * If the handler has not called `res.end()` / `res.json()` / etc. within
 * `timeoutMs` milliseconds, a 503 JSON response is sent.
 *
 * This does NOT abort in-flight DB queries, but it prevents the HTTP
 * connection from hanging indefinitely and frees the client early.
 *
 * @param timeoutMs  Maximum allowed response time in milliseconds (default 30 s)
 */
export function requestTimeout(timeoutMs: number = 30_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Don't enforce timeout on SSE streams (they are intentionally long-lived).
    if (req.headers.accept === 'text/event-stream') {
      return next();
    }

    const timer = setTimeout(() => {
      if (res.headersSent) return; // Response already started — nothing to do.
      const route = routeLabel(req);
      logger.error(
        {
          method: req.method,
          route,
          path: req.path,
          timeoutMs,
        },
        `Request timed out after ${timeoutMs}ms: ${req.method} ${req.path}`,
      );
      res.status(503).json({
        error: {
          statusCode: 503,
          message: 'Request timed out. Please try again.',
          code: 'REQUEST_TIMEOUT',
        },
      });
    }, timeoutMs);

    // Clear the timer once the response has been sent so we don't fire late.
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));

    next();
  };
}
