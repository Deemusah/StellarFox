import type { Request, Response, NextFunction } from 'express';

/**
 * Request ID middleware.
 *
 * Assigns a unique request ID to every incoming request for distributed
 * tracing and cross-service troubleshooting.
 *
 * Behaviour:
 *  1. Reads `X-Request-ID` from the incoming request if present (allows
 *     upstream proxies / gateways to propagate a correlation ID).
 *  2. Falls back to a freshly generated UUID v4 when no header is provided.
 *  3. Stores the ID on `req.requestId` for use in controllers / services.
 *  4. Reflects the ID back to the client via the `X-Request-ID` response
 *     header so clients can correlate logs.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim()
      : crypto.randomUUID();

  // Attach to request object for downstream use
  (req as Request & { requestId: string }).requestId = requestId;

  // Reflect back in response header
  res.setHeader('X-Request-ID', requestId);

  next();
}
