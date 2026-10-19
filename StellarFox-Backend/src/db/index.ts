import { Pool, PoolClient, PoolConfig } from 'pg';

/**
 * Shared PostgreSQL connection pool.
 *
 * Previously each service created its own individual connection, which
 * exhausted the database under load. All services now acquire connections
 * from this single shared pool so connections are reused instead of
 * re-created per request.
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
 * Pool sizing is env-driven so it can be tuned per environment without a
 * code change. Defaults are conservative and appropriate for a single
 * backend instance talking to one PostgreSQL server.
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
  // Fail fast instead of hanging forever when the pool is saturated.
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
      // Idle clients can error out; log instead of crashing the process.
      // eslint-disable-next-line no-console
      console.error('Unexpected error on idle database client', err);
    });
  }
  return pool;
}

/**
 * Runs a query using a pooled connection. The client is released back to
 * the pool automatically so it can be reused by the next caller.
 */
export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const result = await getPool().query(text, params as never);
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

/**
 * Acquires a client from the pool for multi-statement transactions.
 * Callers MUST release the client (ideally via withClient) when done.
 */
export function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Convenience helper that guarantees the pooled client is released even
 * when the callback throws.
 */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Pool metrics for monitoring: total clients, idle clients, and callers
 * currently waiting for a connection.
 */
export interface PoolMetrics {
  total: number;
  idle: number;
  waiting: number;
}

export function getPoolMetrics(): PoolMetrics {
  const current = getPool();
  return {
    total: current.totalCount,
    idle: current.idleCount,
    waiting: current.waitingCount,
  };
}

/**
 * Closes the shared pool. Intended for graceful shutdown and tests.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
