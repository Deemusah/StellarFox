import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { getEnv } from '../config/env';
import { authenticatedUserRateLimit } from './rate-limit.middleware';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveSecret(): string {
  const { JWT_ACCESS_SECRET, JWT_SECRET } = getEnv();
  return JWT_ACCESS_SECRET || JWT_SECRET;
}

function attachCorrelationId(req: Request): string {
  const existing = req.headers['x-correlation-id'];
  const correlationId = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
  (req as unknown as Record<string, unknown>).correlationId = correlationId;
  return correlationId;
}

// ---------------------------------------------------------------------------
// requireAuth — validates JWT and attaches userId / sessionVersion / correlationId
// ---------------------------------------------------------------------------

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const correlationId = attachCorrelationId(req);

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn({ correlationId, msg: 'requireAuth: missing or invalid Authorization header' });
      throw new AppError(401, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const secret = resolveSecret();

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, secret) as jwt.JwtPayload;
    } catch (jwtErr) {
      logger.warn({ correlationId, msg: 'requireAuth: JWT verification failed', error: (jwtErr as Error).message });
      throw new AppError(401, 'Invalid or expired token');
    }

    if (payload.type !== 'access') {
      logger.warn({ correlationId, userId: payload.sub, msg: 'requireAuth: wrong token type', type: payload.type });
      throw new AppError(401, 'Invalid token type');
    }

    const userId = payload.sub as string;
    const sessionVersion: number = payload.sv ?? 0;

    const revoked = await authService.isSessionRevoked(userId, sessionVersion);
    if (revoked) {
      logger.warn({ correlationId, userId, sessionVersion, msg: 'requireAuth: session has been invalidated' });
      throw new AppError(401, 'Session has been invalidated');
    }

    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.sessionVersion = sessionVersion;
    // correlationId is already set by attachCorrelationId above

    (req as unknown as Record<string, unknown>).userId = userId;
    (req as unknown as Record<string, unknown>).sessionVersion = sessionVersion;
    return authenticatedUserRateLimit(req, _res, next);
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
  }
}

// ---------------------------------------------------------------------------
// requireRole — middleware factory for role-based access control
// ---------------------------------------------------------------------------

export function requireRole(role: string) {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    const r = req as unknown as Record<string, unknown>;
    const correlationId = (r.correlationId as string | undefined) ?? attachCorrelationId(req);

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        logger.warn({ correlationId, role, msg: 'requireRole: missing or invalid Authorization header' });
        throw new AppError(401, 'Missing or invalid Authorization header');
      }

      const token = authHeader.slice(7);
      const secret = resolveSecret();

      let payload: jwt.JwtPayload;
      try {
        payload = jwt.verify(token, secret) as jwt.JwtPayload;
      } catch (jwtErr) {
        logger.warn({ correlationId, role, msg: 'requireRole: JWT verification failed', error: (jwtErr as Error).message });
        throw new AppError(401, 'Invalid or expired token');
      }

      if (payload.type !== 'access') {
        logger.warn({ correlationId, role, msg: 'requireRole: wrong token type', type: payload.type });
        throw new AppError(401, 'Invalid token type');
      }

      if (payload.role !== role) {
        logger.warn({ correlationId, userId: payload.sub, requiredRole: role, actualRole: payload.role, msg: 'requireRole: insufficient role' });
        throw new AppError(403, `Forbidden: ${role} role required`);
      }

      const userId = payload.sub as string;
      const sessionVersion: number = payload.sv ?? 0;

      const revoked = await authService.isSessionRevoked(userId, sessionVersion);
      if (revoked) {
        logger.warn({ correlationId, userId, sessionVersion, msg: 'requireRole: session has been invalidated' });
        throw new AppError(401, 'Session has been invalidated');
      }

      r.userId = userId;
      r.sessionVersion = sessionVersion;

      next();
    } catch (err) {
      next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired token'));
    }
  };
}

// ---------------------------------------------------------------------------
// optionalAuth — sets userId if a valid Bearer token is present; never rejects
// ---------------------------------------------------------------------------

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  attachCorrelationId(req);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // No token — continue without userId
    return next();
  }

  try {
    const token = authHeader.slice(7);
    const secret = resolveSecret();
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;

    if (payload.type === 'access' && payload.sub) {
      const r = req as unknown as Record<string, unknown>;
      r.userId = payload.sub as string;
      r.sessionVersion = payload.sv ?? 0;
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
}
