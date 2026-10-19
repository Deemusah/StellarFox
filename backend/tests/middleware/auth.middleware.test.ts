import type { Request, Response, NextFunction } from 'express';
import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AppError } from '../../src/utils/AppError';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

const ACCESS_SECRET = 'test-access-secret';
const JWT_SECRET = 'test-secret';

jest.mock('../../src/config/env', () => ({
  getEnv: jest.fn(() => ({
    JWT_SECRET,
    JWT_ACCESS_SECRET: ACCESS_SECRET,
  })),
}));

const mockIsSessionRevoked = jest.fn<() => Promise<boolean>>();
jest.mock('../../src/services/auth.service', () => ({
  isSessionRevoked: mockIsSessionRevoked,
}));

const mockLogger = {
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};
jest.mock('../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Import AFTER mocks are in place
import { requireAuth, requireRole, optionalAuth } from '../../src/middleware/auth.middleware';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal access token signed with the test access secret */
function makeToken(
  overrides: Record<string, unknown> = {},
  secret: string = ACCESS_SECRET,
  options: jwt.SignOptions = { expiresIn: '1h' },
): string {
  const payload = {
    sub: 'user-123',
    type: 'access',
    sv: 1,
    ...overrides,
  };
  return jwt.sign(payload, secret, options);
}

/** Create req/res/next stubs */
function makeReqRes(authHeader?: string, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (authHeader !== undefined) {
    headers.authorization = authHeader;
  }
  const req = { headers } as unknown as Request;
  const res = {} as Response;
  const next = jest.fn() as unknown as NextFunction;
  return { req, res, next };
}

/** Cast req to access custom properties attached by the middleware */
function reqProps(req: Request): Record<string, unknown> {
  return req as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSessionRevoked.mockResolvedValue(false);
  });

  it('calls next() with no error and sets userId + correlationId for a valid token', async () => {
    const token = makeToken();
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBe('user-123');
    expect(typeof reqProps(req).correlationId).toBe('string');
  });

  it('sets sessionVersion on req for a valid token', async () => {
    const token = makeToken({ sv: 7 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    expect(reqProps(req).sessionVersion).toBe(7);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { req, res, next } = makeReqRes(); // no header

    await requireAuth(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 when Authorization header lacks Bearer prefix', async () => {
    const token = makeToken();
    const { req, res, next } = makeReqRes(token); // raw token, no "Bearer "

    await requireAuth(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const token = makeToken({}, ACCESS_SECRET, { expiresIn: -1 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const token = makeToken({}, 'wrong-secret');
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 for a token with wrong type (refresh instead of access)', async () => {
    const token = jwt.sign({ sub: 'user-123', type: 'refresh', sv: 1 }, ACCESS_SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/token type/i);
  });

  it('returns 401 when the session is revoked', async () => {
    mockIsSessionRevoked.mockResolvedValue(true);
    const token = makeToken();
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/session/i);
  });

  it('calls isSessionRevoked with correct userId and sessionVersion', async () => {
    mockIsSessionRevoked.mockResolvedValue(false);
    const token = makeToken({ sub: 'user-abc', sv: 3 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    expect(mockIsSessionRevoked).toHaveBeenCalledWith('user-abc', 3);
  });

  it('logs a warning on auth failures', async () => {
    const { req, res, next } = makeReqRes(); // missing header triggers warning

    await requireAuth(req, res, next);

    expect(mockLogger.warn).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Correlation ID propagation
  // -------------------------------------------------------------------------

  it('uses X-Correlation-ID header when present', async () => {
    const token = makeToken();
    const { req, res, next } = makeReqRes(`Bearer ${token}`, { 'x-correlation-id': 'my-trace-id' });

    await requireAuth(req, res, next);

    expect(reqProps(req).correlationId).toBe('my-trace-id');
  });

  it('generates a UUID correlationId when X-Correlation-ID header is absent', async () => {
    const token = makeToken();
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireAuth(req, res, next);

    const id = reqProps(req).correlationId as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('still attaches a correlationId even when auth fails', async () => {
    const { req, res, next } = makeReqRes(); // no header → 401

    await requireAuth(req, res, next);

    expect(typeof reqProps(req).correlationId).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

describe('requireRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSessionRevoked.mockResolvedValue(false);
  });

  it('calls next() with no error when token carries the required role', async () => {
    const token = makeToken({ role: 'admin' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBe('user-123');
  });

  it('returns 403 when token role does not match the required role', async () => {
    const token = makeToken({ role: 'user' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('admin')(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it('returns 403 when token has no role at all', async () => {
    const token = makeToken(); // no role claim
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('admin')(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { req, res, next } = makeReqRes();

    await requireRole('admin')(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 when token type is wrong', async () => {
    const token = jwt.sign({ sub: 'user-123', type: 'refresh', sv: 1, role: 'admin' }, ACCESS_SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('admin')(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it('returns 401 when session is revoked even with correct role', async () => {
    mockIsSessionRevoked.mockResolvedValue(true);
    const token = makeToken({ role: 'admin' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('admin')(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(401);
  });

  it('works for arbitrary roles (e.g. "moderator")', async () => {
    const token = makeToken({ role: 'moderator' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('moderator')(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('logs a warning when role check fails', async () => {
    const token = makeToken({ role: 'user' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await requireRole('admin')(req, res, next);

    expect(mockLogger.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe('optionalAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsSessionRevoked.mockResolvedValue(false);
  });

  it('sets userId when a valid Bearer token is provided', async () => {
    const token = makeToken();
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBe('user-123');
  });

  it('calls next() without setting userId when Authorization header is absent', async () => {
    const { req, res, next } = makeReqRes();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBeUndefined();
  });

  it('calls next() without rejecting when token is invalid', async () => {
    const { req, res, next } = makeReqRes('Bearer totally.invalid.token');

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBeUndefined();
  });

  it('calls next() without rejecting when token is expired', async () => {
    const token = makeToken({}, ACCESS_SECRET, { expiresIn: -1 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBeUndefined();
  });

  it('does not set userId when token type is not access', async () => {
    const token = jwt.sign({ sub: 'user-123', type: 'refresh', sv: 1 }, ACCESS_SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(reqProps(req).userId).toBeUndefined();
  });

  it('attaches correlationId from X-Correlation-ID header when present', async () => {
    const { req, res, next } = makeReqRes(undefined, { 'x-correlation-id': 'opt-trace-42' });

    await optionalAuth(req, res, next);

    expect(reqProps(req).correlationId).toBe('opt-trace-42');
  });

  it('generates a UUID correlationId when X-Correlation-ID header is absent', async () => {
    const { req, res, next } = makeReqRes();

    await optionalAuth(req, res, next);

    const id = reqProps(req).correlationId as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('sets sessionVersion alongside userId for a valid token', async () => {
    const token = makeToken({ sv: 5 });
    const { req, res, next } = makeReqRes(`Bearer ${token}`);

    await optionalAuth(req, res, next);

    expect(reqProps(req).sessionVersion).toBe(5);
  });
});
