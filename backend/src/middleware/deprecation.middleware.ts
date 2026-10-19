// ============================================================
// BANKERCHANGER — Deprecation Warnings Middleware
// Adds Deprecation headers (RFC 8594) to responses for routes
// that are scheduled for removal, giving clients time to migrate.
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface DeprecationConfig {
  /**
   * ISO-8601 date string after which the endpoint is deprecated.
   * Appears as the `Deprecation` header value (RFC 8594).
   * @example '2027-01-01T00:00:00Z'
   */
  deprecatedSince: string;
  /**
   * ISO-8601 date string when the endpoint will be removed.
   * Appears as the `Sunset` header value (RFC 8594).
   * @example '2027-07-01T00:00:00Z'
   */
  sunsetDate: string;
  /**
   * URL of the migration guide or replacement endpoint.
   * Appears in the `Link` header with `rel="successor-version"`.
   */
  migrationUrl?: string;
  /**
   * Human-readable message included in the JSON response body
   * and logged for observability. Do NOT log sensitive info here.
   */
  message?: string;
}

/**
 * Returns Express middleware that attaches RFC-8594 deprecation headers
 * to every response on the route it is applied to.
 *
 * Headers set:
 *   - `Deprecation: <HTTP-date>` — the date the API was deprecated
 *   - `Sunset: <HTTP-date>`      — the date the API will be removed
 *   - `Link: <url>; rel="successor-version"` (when migrationUrl provided)
 *   - `Warning: 299 - "..."` — human-readable advisory
 *
 * Also injects a `_deprecation` key into every JSON response body so
 * client SDKs can surface the warning without inspecting headers.
 *
 * @example
 * // Apply to individual routes
 * router.get('/v1/markets', deprecate({
 *   deprecatedSince: '2026-10-01T00:00:00Z',
 *   sunsetDate: '2027-04-01T00:00:00Z',
 *   migrationUrl: '/api/v2/markets',
 * }), listMarketsHandlerV1);
 */
export function deprecate(config: DeprecationConfig) {
  const deprecationDate = toHttpDate(config.deprecatedSince);
  const sunsetDate = toHttpDate(config.sunsetDate);
  const message =
    config.message ??
    `This endpoint is deprecated since ${config.deprecatedSince} and will be removed on ${config.sunsetDate}.${config.migrationUrl ? ` Please migrate to ${config.migrationUrl}.` : ''}`;

  return function deprecationMiddleware(req: Request, res: Response, next: NextFunction): void {
    // RFC 8594 headers
    res.setHeader('Deprecation', deprecationDate);
    res.setHeader('Sunset', sunsetDate);

    if (config.migrationUrl) {
      res.setHeader('Link', `<${config.migrationUrl}>; rel="successor-version"`);
    }

    // RFC 7234 Warning header for legacy proxies / clients
    res.setHeader('Warning', `299 - "${message}"`);

    // Log for observability (helps track who is still using deprecated endpoints)
    logger.warn(
      {
        deprecatedRoute: req.originalUrl,
        method: req.method,
        sunsetDate: config.sunsetDate,
        migrationUrl: config.migrationUrl,
      },
      'Deprecated endpoint called',
    );

    // Intercept json() so we can inject the deprecation notice into response bodies
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown): Response {
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        (body as Record<string, unknown>)['_deprecation'] = {
          message,
          sunsetDate: config.sunsetDate,
          ...(config.migrationUrl && { migrationUrl: config.migrationUrl }),
        };
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Returns a middleware factory that deprecates every route on a given
 * Express Router, useful for retiring an entire API version at once.
 *
 * @example
 * const v1Router = express.Router();
 * v1Router.use(deprecateRouter({
 *   deprecatedSince: '2026-10-01T00:00:00Z',
 *   sunsetDate:      '2027-04-01T00:00:00Z',
 *   migrationUrl:    '/api/v2',
 * }));
 */
export function deprecateRouter(config: DeprecationConfig) {
  return deprecate(config);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Converts an ISO-8601 string to an RFC 7231 HTTP-date string. */
function toHttpDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // fall back to raw string if unparseable
  return d.toUTCString();
}
