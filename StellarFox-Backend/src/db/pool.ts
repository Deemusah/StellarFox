import { Pool, PoolClient, PoolConfig } from 'pg';

/**
 * Shared PostgreSQL connection pool.
 *
 * Previously each service created its own individual connections, which
 * exhausted the database under load. A single shared pool is created here and
 * reused across the backend so connections are recycled instead of opened per
 * request/service.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Pool sizing is env-driven so it can be tuned per environment without code
 * changes. Defaults are conservative and appropriate for a single backend
 * instance; scale `DB_POOL_MAX` with the number of app instances and the
 * database's max_connections.
 */
export const poolConfig: PoolConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: envInt('DB_PORT', 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Maximum number of clients the pool will create.
  max: envInt('DB_POOL_MAX', 10),
  // Minimum number of idle clients kept warm for reuse.
  min: envInt('DB_POOL_MIN', 2),
  // Close idle clients after this many milliseconds.
  idleTimeoutMillis: envInt('DB_POOL_IDLE_TIMEOUT_MS', 30_000),
  // Fail fast instead of hanging when the pool is saturated.
  connectionTimeoutMillis: envInt('DB_POOL_CONNECTION_TIMEOUT_MS', 5_000),
};

let pool: Pool | undefined;

/**
 * Returns the process-wide shared pool, creating it on first use.
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig);
    pool.on('error', (err) => {
      // Idle clients can error out; log and let the pool replace them.
      // eslint-disable-next-line no-console
      console.error('[db] unexpected idle client error', err);
    });
  }
  return pool;
}

/**
 * Runs a query against a pooled client. The client is released back to the
 * pool automatically so connections are reused.
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await getPool().query(text, params as never);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

/**
 * Borrows a client from the pool for multi-statement transactions. Callers MUST
 * release the client (ideally in a finally block) so it returns to the pool.
 */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export interface PoolMetrics {
  total: number;
  idle: number;
  waiting: number;
}

/**
 * Snapshot of current pool metrics for monitoring/health endpoints.
 */
export function getPoolMetrics(): PoolMetrics {
  const p = getPool();
  return {
    total: p.totalCount,
    idle: p.idleCount,
    waiting: p.waitingCount,
  };
}

/**
 * Gracefully drains the pool. Intended for shutdown hooks.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
