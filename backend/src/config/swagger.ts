import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import type { Express } from 'express';
import { logger } from '../utils/logger';

function resolveOpenApiPath(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'openapi.yaml');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(__dirname, 'openapi.yaml');
}

/** Resolved absolute path to the openapi.yaml file. */
export const OPENAPI_PATH = resolveOpenApiPath();

/** Minimal fallback spec returned when openapi.yaml cannot be loaded. */
const FALLBACK_SPEC: Record<string, unknown> = {
  openapi: '3.0.3',
  info: {
    title: 'BANKERCHANGER API',
    version: '0.0.0',
    description: 'API documentation temporarily unavailable.',
  },
  paths: {},
};

/**
 * Load and parse the OpenAPI YAML spec from disk.
 * Returns a minimal fallback spec and logs a warning if the file cannot be
 * read or parsed, rather than throwing.
 */
export function loadOpenApiSpec(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(OPENAPI_PATH, 'utf8');
    return parseYaml(raw) as Record<string, unknown>;
  } catch (err) {
    logger.warn(
      `[swagger] Failed to load OpenAPI spec from ${OPENAPI_PATH}: ${(err as Error).message}. ` +
        'Falling back to minimal spec.',
    );
    return { ...FALLBACK_SPEC };
  }
}

/**
 * Validate the basic structure of an OpenAPI spec object.
 * Checks that the required top-level fields are present:
 *   - `openapi` (version string)
 *   - `info`    (object)
 *   - `paths`   (object)
 *
 * @returns `true` when all required fields are present and of the correct
 *          type, `false` otherwise.
 */
export function validateOpenApiSpec(spec: Record<string, unknown>): boolean {
  if (typeof spec !== 'object' || spec === null) return false;

  // openapi field must be a non-empty string
  if (typeof spec['openapi'] !== 'string' || spec['openapi'].trim() === '') return false;

  // info must be a plain object
  if (typeof spec['info'] !== 'object' || spec['info'] === null || Array.isArray(spec['info']))
    return false;

  // paths must be a plain object
  if (typeof spec['paths'] !== 'object' || spec['paths'] === null || Array.isArray(spec['paths']))
    return false;

  return true;
}

export function setupSwagger(app: Express): void {
  const swaggerSpec = loadOpenApiSpec();
  const specLoaded = validateOpenApiSpec(swaggerSpec);
  const paths = specLoaded
    ? (swaggerSpec['paths'] as Record<string, unknown>)
    : {};
  const pathCount = Object.keys(paths).length;

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  );

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  app.get('/api/docs/openapi.yaml', (_req, res) => {
    try {
      res.type('text/yaml');
      res.send(fs.readFileSync(OPENAPI_PATH, 'utf8'));
    } catch (err) {
      res.status(503).json({ error: 'OpenAPI YAML file not available.' });
    }
  });

  /**
   * Health endpoint for the OpenAPI/Swagger integration.
   * Returns whether the spec was loaded successfully and how many paths it
   * documents.
   */
  app.get('/api/docs/health', (_req, res) => {
    res.json({
      status: 'ok',
      specLoaded,
      pathCount,
    });
  });
}
