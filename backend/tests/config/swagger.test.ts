/**
 * tests/config/swagger.test.ts
 *
 * Tests for the OpenAPI/Swagger configuration.
 * Reads the real openapi.yaml from disk — no file-system mocking.
 */

import type { Express, Request, Response } from 'express';
import {
  loadOpenApiSpec,
  validateOpenApiSpec,
  setupSwagger,
  OPENAPI_PATH,
} from '../../src/config/swagger';

// ---------------------------------------------------------------------------
// Minimal Express app mock — just enough for setupSwagger to register routes
// ---------------------------------------------------------------------------

function createMockApp(): Express {
  const handlers: Record<string, jest.Mock> = {};
  const app = {
    use: jest.fn(),
    get: jest.fn((path: string, ...fns: unknown[]) => {
      handlers[path] = fns[fns.length - 1] as jest.Mock;
    }),
    // Store registered handlers so we can invoke them in tests
    _handlers: handlers,
  } as unknown as Express;
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Call the route handler registered under `path` with mock req/res. */
function callRoute(
  app: Express,
  routePath: string,
): { req: Partial<Request>; res: Partial<Response>; next: jest.Mock } {
  const mockApp = app as unknown as ReturnType<typeof createMockApp> & {
    _handlers: Record<string, (...args: unknown[]) => unknown>;
  };

  const req: Partial<Request> = {};
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    type: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  const next: jest.Mock = jest.fn();

  const handler = mockApp._handlers[routePath];
  if (handler) handler(req, res, next);

  return { req, res, next };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OPENAPI_PATH', () => {
  it('should be a non-empty string pointing to an existing file', () => {
    const fs = require('fs');
    expect(typeof OPENAPI_PATH).toBe('string');
    expect(OPENAPI_PATH.length).toBeGreaterThan(0);
    expect(fs.existsSync(OPENAPI_PATH)).toBe(true);
  });
});

describe('loadOpenApiSpec()', () => {
  let spec: Record<string, unknown>;

  beforeAll(() => {
    spec = loadOpenApiSpec();
  });

  it('should return an object', () => {
    expect(typeof spec).toBe('object');
    expect(spec).not.toBeNull();
  });

  it('should have an "openapi" field', () => {
    expect(spec).toHaveProperty('openapi');
    expect(typeof spec['openapi']).toBe('string');
  });

  it('should have an "info" field that is an object', () => {
    expect(spec).toHaveProperty('info');
    expect(typeof spec['info']).toBe('object');
    expect(spec['info']).not.toBeNull();
  });

  it('should have a "paths" field that is an object', () => {
    expect(spec).toHaveProperty('paths');
    expect(typeof spec['paths']).toBe('object');
    expect(spec['paths']).not.toBeNull();
  });

  it('should have a non-zero number of documented paths', () => {
    const paths = spec['paths'] as Record<string, unknown>;
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it('should have info.title set to a non-empty string', () => {
    const info = spec['info'] as Record<string, unknown>;
    expect(typeof info['title']).toBe('string');
    expect((info['title'] as string).trim().length).toBeGreaterThan(0);
  });

  it('should have info.version set to a non-empty string', () => {
    const info = spec['info'] as Record<string, unknown>;
    expect(typeof info['version']).toBe('string');
    expect((info['version'] as string).trim().length).toBeGreaterThan(0);
  });

  it('should include securitySchemes with bearerAuth', () => {
    const components = spec['components'] as Record<string, unknown> | undefined;
    expect(components).toBeDefined();

    const securitySchemes = (components as Record<string, unknown>)[
      'securitySchemes'
    ] as Record<string, unknown> | undefined;
    expect(securitySchemes).toBeDefined();

    expect(securitySchemes).toHaveProperty('bearerAuth');
    const bearerAuth = (securitySchemes as Record<string, unknown>)[
      'bearerAuth'
    ] as Record<string, unknown>;
    expect(bearerAuth['type']).toBe('http');
    expect(bearerAuth['scheme']).toBe('bearer');
  });
});

describe('validateOpenApiSpec()', () => {
  it('should return true for a valid spec loaded from openapi.yaml', () => {
    const spec = loadOpenApiSpec();
    expect(validateOpenApiSpec(spec)).toBe(true);
  });

  it('should return true for a manually constructed valid spec', () => {
    const validSpec = {
      openapi: '3.0.3',
      info: { title: 'Test API', version: '1.0.0' },
      paths: { '/health': {} },
    };
    expect(validateOpenApiSpec(validSpec)).toBe(true);
  });

  it('should return false when "openapi" field is missing', () => {
    const spec = {
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };
    expect(validateOpenApiSpec(spec)).toBe(false);
  });

  it('should return false when "openapi" field is not a string', () => {
    const spec = {
      openapi: 3,
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };
    expect(validateOpenApiSpec(spec as Record<string, unknown>)).toBe(false);
  });

  it('should return false when "openapi" field is an empty string', () => {
    const spec = {
      openapi: '',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
    };
    expect(validateOpenApiSpec(spec)).toBe(false);
  });

  it('should return false when "info" field is missing', () => {
    const spec = {
      openapi: '3.0.3',
      paths: {},
    };
    expect(validateOpenApiSpec(spec)).toBe(false);
  });

  it('should return false when "info" is null', () => {
    const spec = {
      openapi: '3.0.3',
      info: null,
      paths: {},
    };
    expect(validateOpenApiSpec(spec as Record<string, unknown>)).toBe(false);
  });

  it('should return false when "paths" field is missing', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
    };
    expect(validateOpenApiSpec(spec)).toBe(false);
  });

  it('should return false when "paths" is an array instead of an object', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test', version: '1.0.0' },
      paths: [],
    };
    expect(validateOpenApiSpec(spec as unknown as Record<string, unknown>)).toBe(false);
  });

  it('should return false for an empty object', () => {
    expect(validateOpenApiSpec({})).toBe(false);
  });

  it('should return false for a completely invalid value', () => {
    expect(validateOpenApiSpec(null as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('setupSwagger()', () => {
  it('should be a callable function', () => {
    expect(typeof setupSwagger).toBe('function');
  });

  it('should register middleware and route handlers without throwing', () => {
    const app = createMockApp();
    expect(() => setupSwagger(app)).not.toThrow();
  });

  it('should call app.use to mount swagger-ui-express at /api/docs', () => {
    const app = createMockApp();
    setupSwagger(app);
    const useMock = app.use as jest.Mock;
    const mountedPaths = useMock.mock.calls.map((call) => call[0]);
    expect(mountedPaths).toContain('/api/docs');
  });

  it('should register a GET handler for /api/docs/openapi.json', () => {
    const app = createMockApp();
    setupSwagger(app);
    const getMock = app.get as jest.Mock;
    const registeredPaths = getMock.mock.calls.map((call) => call[0]);
    expect(registeredPaths).toContain('/api/docs/openapi.json');
  });

  it('should register a GET handler for /api/docs/openapi.yaml', () => {
    const app = createMockApp();
    setupSwagger(app);
    const getMock = app.get as jest.Mock;
    const registeredPaths = getMock.mock.calls.map((call) => call[0]);
    expect(registeredPaths).toContain('/api/docs/openapi.yaml');
  });

  it('should register a GET handler for /api/docs/health', () => {
    const app = createMockApp();
    setupSwagger(app);
    const getMock = app.get as jest.Mock;
    const registeredPaths = getMock.mock.calls.map((call) => call[0]);
    expect(registeredPaths).toContain('/api/docs/health');
  });

  describe('/api/docs/health handler', () => {
    it('should return { status: "ok", specLoaded: true, pathCount: N } where N > 0', () => {
      const app = createMockApp();
      setupSwagger(app);

      const { res } = callRoute(app, '/api/docs/health');
      const jsonMock = res.json as jest.Mock;
      expect(jsonMock).toHaveBeenCalledTimes(1);

      const body = jsonMock.mock.calls[0][0] as {
        status: string;
        specLoaded: boolean;
        pathCount: number;
      };
      expect(body.status).toBe('ok');
      expect(body.specLoaded).toBe(true);
      expect(typeof body.pathCount).toBe('number');
      expect(body.pathCount).toBeGreaterThan(0);
    });
  });

  describe('/api/docs/openapi.json handler', () => {
    it('should respond with the parsed spec object', () => {
      const app = createMockApp();
      setupSwagger(app);

      const { res } = callRoute(app, '/api/docs/openapi.json');
      const jsonMock = res.json as jest.Mock;
      expect(jsonMock).toHaveBeenCalledTimes(1);

      const body = jsonMock.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof body).toBe('object');
      expect(body).toHaveProperty('openapi');
      expect(body).toHaveProperty('info');
      expect(body).toHaveProperty('paths');
    });
  });
});

describe('Real spec — structural checks', () => {
  let spec: Record<string, unknown>;

  beforeAll(() => {
    spec = loadOpenApiSpec();
  });

  it('should have at least 5 documented paths', () => {
    const paths = spec['paths'] as Record<string, unknown>;
    expect(Object.keys(paths).length).toBeGreaterThanOrEqual(5);
  });

  it('should have info.title equal to "BANKERCHANGER API"', () => {
    const info = spec['info'] as Record<string, unknown>;
    expect(info['title']).toBe('BANKERCHANGER API');
  });

  it('should have a semver-like info.version', () => {
    const info = spec['info'] as Record<string, unknown>;
    // e.g. "0.2.0" — just check it contains digits and dots
    expect(/^\d+\.\d+/.test(info['version'] as string)).toBe(true);
  });

  it('should pass validateOpenApiSpec', () => {
    expect(validateOpenApiSpec(spec)).toBe(true);
  });
});
