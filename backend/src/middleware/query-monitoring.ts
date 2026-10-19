// ============================================================
// BANKERCHANGER — Query Monitoring & Optimization
// Wraps the pg Pool to track query duration, log slow queries,
// and expose Prometheus metrics for data-driven optimization.
// ============================================================

import type { Pool, QueryResult, QueryConfig, QueryConfigValues, Submittable } from 'pg';
import { logger } from '../utils/logger';
import { dbQueryDuration } from '../services/metrics.service';

/** Default threshold (ms) above which a query is logged as slow. */
const DEFAULT_SLOW_THRESHOLD_MS = 100;

const slowThresholdMs = (() => {
  const raw = process.env.SLOW_QUERY_THRESHOLD_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_SLOW_THRESHOLD_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOW_THRESHOLD_MS;
})();

/** Detects the SQL operation keyword (SELECT, INSERT, UPDATE, DELETE) for metric labels. */
function detectOperation(sql: string): string {
  const trimmed = sql.trimStart().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'select';
  if (trimmed.startsWith('INSERT')) return 'insert';
  if (trimmed.startsWith('UPDATE')) return 'update';
  if (trimmed.startsWith('DELETE')) return 'delete';
  return 'other';
}

/**
 * Extracts a normalized query fingerprint for logging.
 * Replaces parameter placeholders ($1, $2, …) and string/number literals
 * so that similar queries group together in logs without exposing values.
 */
function fingerprint(sql: string): string {
  return sql
    .replace(/\$\d+/g, '$N')
    .replace(/'[^']*'/g, "'?'")
    .replace(/\b\d+\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export interface QueryMonitorOptions {
  slowThresholdMs?: number;
  /** Skip monitoring for specific query patterns (e.g. health checks). */
  ignorePatterns?: RegExp[];
}

const defaultIgnorePatterns = [/^SELECT\s+1\b/i];

/**
 * Wraps a pg Pool so every `.query()` call is timed, logged when slow,
 * and recorded in Prometheus metrics.
 *
 * Call `installQueryMonitor(pool)` once at startup — it monkey-patches
 * `pool.query` in place and returns the same pool for convenience.
 */
export function installQueryMonitor(pool: Pool, options?: QueryMonitorOptions): Pool {
  const threshold = options?.slowThresholdMs ?? slowThresholdMs;
  const ignorePatterns = options?.ignorePatterns ?? defaultIgnorePatterns;
  const originalQuery = pool.query.bind(pool);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function monitoredQuery(this: Pool, ...args: any[]): Promise<QueryResult> {
    // Extract the SQL string from the various pg query call signatures
    let sql: string;
    if (typeof args[0] === 'string') {
      sql = args[0] as string;
    } else if (args[0] && typeof args[0] === 'object' && 'text' in args[0]) {
      sql = (args[0] as QueryConfig).text;
    } else {
      sql = String(args[0] ?? '');
    }

    // Skip monitoring for ignored patterns (health checks etc.)
    if (ignorePatterns.some((p) => p.test(sql))) {
      return originalQuery(...(args as Parameters<typeof originalQuery>));
    }

    const operation = detectOperation(sql);
    const fp = fingerprint(sql);
    const start = process.hrtime.bigint();

    return originalQuery(...(args as Parameters<typeof originalQuery>)).then(
      (result: QueryResult) => {
        recordTiming(operation, fp, start, threshold);
        return result;
      },
      (err: unknown) => {
        recordTiming(operation, fp, start, threshold);
        logger.error({ fp, err: err instanceof Error ? err.message : String(err) }, 'Query error');
        throw err;
      },
    );
  }

  // Preserve Submittable interface if present
  const patched = monitoredQuery as unknown as typeof pool.query & Submittable;
  // Copy over any additional properties from the original
  Object.assign(patched, originalQuery);
  pool.query = patched as typeof pool.query;

  logger.info(
    { slowThresholdMs: threshold },
    'Query monitor installed — slow queries will be logged and exported as metrics',
  );

  return pool;
}

function recordTiming(operation: string, fingerprint: string, start: bigint, threshold: number): void {
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1_000_000;

  dbQueryDuration.labels(operation).observe(elapsedMs / 1000);

  if (elapsedMs >= threshold) {
    logger.warn(
      { fingerprint, operation, elapsedMs, threshold },
      'Slow query detected — consider optimization (indexes, query rewrite, caching)',
    );
  }
}
