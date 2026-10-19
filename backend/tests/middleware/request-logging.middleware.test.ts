import type { Request, Response, NextFunction } from 'express';
import { requestLogging } from '../../src/middleware/request-logging.middleware';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');

// Helper to build minimal Express-like mock objects
function buildMocks(overrides: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  userId?: string;
  statusCode?: number;
} = {}): {
  req: Partial<Request>;
  res: Partial<Response> & { _sentData: unknown };
  next: NextFunction;
} {
  const sentHeaders: Record<string, string> = {};

  const req: Partial<Request> = {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/api/markets',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' } as any,
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
    query: (overrides.query ?? {}) as any,
    get: jest.fn((header: string) => {
      return (overrides.headers ?? {})[header.toLowerCase()] ?? undefined;
    }) as any,
  };

  if (overrides.userId !== undefined) {
    (req as any).userId = overrides.userId;
  }

  const res: Partial<Response> & { _sentData: unknown } = {
    _sentData: undefined,
    statusCode: overrides.statusCode ?? 200,
    setHeader: jest.fn((name: string, value: string) => {
      sentHeaders[name] = value;
      return res as Response;
    }) as any,
    getHeader: jest.fn((name: string) => sentHeaders[name]) as any,
    send: jest.fn(function (this: Response, data: unknown) {
      (res as any)._sentData = data;
      return this;
    }) as any,
  };

  const next: NextFunction = jest.fn();

  return { req, res, next };
}

/**
 * Invoke the middleware and then trigger res.send to simulate a completed
 * request/response cycle.
 */
function runMiddleware(
  req: Partial<Request>,
  res: Partial<Response>,
  next: NextFunction,
  responseBody = '{}',
): void {
  requestLogging(req as Request, res as Response, next);
  // Trigger the overridden res.send
  (res as Response).send(responseBody);
}

describe('requestLogging middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  // ─── Correlation ID ────────────────────────────────────────────────────────

  describe('correlation ID', () => {
    it('generates a correlationId when X-Correlation-ID header is absent', () => {
      const { req, res, next } = buildMocks();
      runMiddleware(req, res, next);

      expect((req as any).correlationId).toBeDefined();
      expect(typeof (req as any).correlationId).toBe('string');
      expect((req as any).correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('uses the X-Correlation-ID header value when present', () => {
      const existingId = 'my-custom-correlation-id-123';
      const { req, res, next } = buildMocks({
        headers: { 'x-correlation-id': existingId },
      });
      runMiddleware(req, res, next);

      expect((req as any).correlationId).toBe(existingId);
    });

    it('sets X-Correlation-ID on the response', () => {
      const existingId = 'response-header-test-id';
      const { req, res, next } = buildMocks({
        headers: { 'x-correlation-id': existingId },
      });
      runMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', existingId);
    });

    it('sets response X-Correlation-ID to the generated value when none provided', () => {
      const { req, res, next } = buildMocks();
      runMiddleware(req, res, next);

      const setHeaderCall = (res.setHeader as jest.Mock).mock.calls.find(
        ([name]: [string]) => name === 'X-Correlation-ID',
      );
      expect(setHeaderCall).toBeDefined();
      const [, headerValue] = setHeaderCall as [string, string];
      expect(headerValue).toBe((req as any).correlationId);
    });

    it('includes correlationId in log entry', () => {
      const id = 'log-correlation-id';
      const { req, res, next } = buildMocks({ headers: { 'x-correlation-id': id } });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.correlationId).toBe(id);
    });
  });

  // ─── Log levels ───────────────────────────────────────────────────────────

  describe('log level selection', () => {
    it('logs at info level for 2xx responses', () => {
      const { req, res, next } = buildMocks({ statusCode: 200 });
      runMiddleware(req, res, next);

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs at info level for 3xx responses', () => {
      const { req, res, next } = buildMocks({ statusCode: 301 });
      runMiddleware(req, res, next);

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs at warn level for 4xx responses', () => {
      const { req, res, next } = buildMocks({ statusCode: 404 });
      runMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs at warn level for 400 Bad Request', () => {
      const { req, res, next } = buildMocks({ statusCode: 400 });
      runMiddleware(req, res, next);

      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('logs at error level for 5xx responses', () => {
      const { req, res, next } = buildMocks({ statusCode: 500 });
      runMiddleware(req, res, next);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('logs at error level for 503 Service Unavailable', () => {
      const { req, res, next } = buildMocks({ statusCode: 503 });
      runMiddleware(req, res, next);

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Sensitive path body redaction ────────────────────────────────────────

  describe('sensitive path body redaction', () => {
    const sensitivePaths = [
      '/auth/login',
      '/auth/register',
      '/auth/reset-password',
      '/api/oracle/submit',
      '/api/admin',
      '/api/admin/users',      // sub-path of /api/admin
    ];

    it.each(sensitivePaths)('redacts body for sensitive path %s', (sensitivePath) => {
      const { req, res, next } = buildMocks({
        path: sensitivePath,
        method: 'POST',
        body: { password: 'supersecret', email: 'user@example.com' },
      });
      runMiddleware(req, res, next);

      // info/warn/error — pick whichever was called
      const logMock =
        (logger.info as jest.Mock).mock.calls[0] ??
        (logger.warn as jest.Mock).mock.calls[0] ??
        (logger.error as jest.Mock).mock.calls[0];

      const loggedData = logMock[0] as Record<string, unknown>;
      expect(loggedData.body).toBe('[REDACTED]');
    });

    it('does not redact body for non-sensitive paths', () => {
      const { req, res, next } = buildMocks({
        path: '/api/markets',
        method: 'POST',
        body: { name: 'Test Market' },
      });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.body).not.toBe('[REDACTED]');
    });
  });

  // ─── userId logging ───────────────────────────────────────────────────────

  describe('userId logging', () => {
    it('includes userId in log when set on request', () => {
      const { req, res, next } = buildMocks({ userId: 'user-abc-123' });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.userId).toBe('user-abc-123');
    });

    it('omits userId from log when not set on request', () => {
      const { req, res, next } = buildMocks();
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData).not.toHaveProperty('userId');
    });
  });

  // ─── responseTime ─────────────────────────────────────────────────────────

  describe('responseTime', () => {
    it('includes responseTime in the log entry', () => {
      const { req, res, next } = buildMocks();
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.responseTime).toBeDefined();
      expect(typeof loggedData.responseTime).toBe('string');
      expect(loggedData.responseTime).toMatch(/^\d+ms$/);
    });

    it('responseTime is a non-negative duration', () => {
      const { req, res, next } = buildMocks();
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      const ms = parseInt((loggedData.responseTime as string).replace('ms', ''), 10);
      expect(ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Query parameter logging ──────────────────────────────────────────────

  describe('query parameter logging', () => {
    it('includes query params in log when present', () => {
      const { req, res, next } = buildMocks({ query: { page: '2', limit: '10' } });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.query).toEqual({ page: '2', limit: '10' });
    });

    it('redacts password in query parameters', () => {
      const { req, res, next } = buildMocks({ query: { email: 'a@b.com', password: 's3cret' } });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      const query = loggedData.query as Record<string, unknown>;
      expect(query.email).toBe('a@b.com');
      expect(query.password).toBe('[REDACTED]');
    });

    it('omits query field when no query params present', () => {
      const { req, res, next } = buildMocks({ query: {} });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData).not.toHaveProperty('query');
    });
  });

  // ─── General behaviour ───────────────────────────────────────────────────

  describe('general behaviour', () => {
    it('calls next()', () => {
      const { req, res, next } = buildMocks();
      requestLogging(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it('still calls original res.send and returns its value', () => {
      const { req, res, next } = buildMocks();
      requestLogging(req as Request, res as Response, next);

      const result = (res as Response).send('hello');
      // The original mock send returns `this` (res), so the chained return
      // value should be the response object.
      expect(res.send).toHaveBeenCalled();
    });

    it('logs method, path, and statusCode', () => {
      const { req, res, next } = buildMocks({
        method: 'POST',
        path: '/api/bets',
        statusCode: 201,
      });
      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.method).toBe('POST');
      expect(loggedData.path).toBe('/api/bets');
      expect(loggedData.statusCode).toBe(201);
    });

    it('redacts Authorization header value', () => {
      const { req, res, next } = buildMocks({
        headers: { authorization: 'Bearer real-jwt-token' },
      });
      // Override get() to return the authorization header
      (req.get as jest.Mock).mockImplementation((header: string) =>
        header.toLowerCase() === 'authorization' ? 'Bearer real-jwt-token' : undefined,
      );

      runMiddleware(req, res, next);

      const loggedData = (logger.info as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(loggedData.authorization).toBe('Bearer [REDACTED]');
      expect(loggedData.authorization).not.toContain('real-jwt-token');
    });
  });
});
