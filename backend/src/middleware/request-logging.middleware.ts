import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

const SENSITIVE_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/api/oracle/submit',
  '/api/admin',
];

const SENSITIVE_QUERY_PARAMS = ['password', 'token', 'secret', 'api_key', 'apikey'];

function sanitizeQuery(query: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    sanitized[key] = SENSITIVE_QUERY_PARAMS.includes(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return sanitized;
}

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const path = req.path;

  // Read or generate correlation ID
  const correlationId =
    (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();

  // Attach to request for downstream handlers
  (req as any).correlationId = correlationId;

  // Set response header immediately so it's present on all responses
  res.setHeader('X-Correlation-ID', correlationId);

  const originalSend = res.send;
  res.send = function (data: unknown) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    const isSensitive = SENSITIVE_PATHS.some((p) => path.startsWith(p));
    const body = isSensitive ? '[REDACTED]' : JSON.stringify(req.body);

    const authHeader = req.get('authorization');
    const displayAuthHeader = authHeader ? 'Bearer [REDACTED]' : undefined;

    const userId = (req as any).userId as string | undefined;

    const sanitizedQuery =
      Object.keys(req.query).length > 0 ? sanitizeQuery(req.query as Record<string, unknown>) : undefined;

    const logData: Record<string, unknown> = {
      correlationId,
      method,
      path,
      statusCode,
      responseTime: `${responseTime}ms`,
      ip,
      ...(sanitizedQuery && { query: sanitizedQuery }),
      body,
      ...(displayAuthHeader && { authorization: displayAuthHeader }),
      ...(userId && { userId }),
    };

    const message =
      process.env.NODE_ENV === 'production'
        ? `${method} ${path} ${statusCode}`
        : `${method} ${path} ${statusCode} (${responseTime}ms)`;

    if (statusCode >= 500) {
      logger.error(logData, message);
    } else if (statusCode >= 400) {
      logger.warn(logData, message);
    } else {
      logger.info(logData, message);
    }

    return originalSend.call(this, data);
  };

  next();
}
