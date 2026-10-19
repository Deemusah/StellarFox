import { Counter, Histogram, Gauge, Summary, register, collectDefaultMetrics } from 'prom-client';

// Collect default Node.js metrics (GC, event loop, memory, etc.)
collectDefaultMetrics({ register });

register.setDefaultLabels({ app: 'bankerchanger' });

// ── HTTP Request Metrics ──────────────────────────────────────────────────────

/** Histogram tracking HTTP request duration in seconds, labeled by method, route, and status code. */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

/** Counter tracking total HTTP requests, labeled by method, route, and status code. */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
});

/**
 * Counter for slow HTTP requests (those exceeding the SLOW_REQUEST_THRESHOLD_MS).
 * Labeled by method and route to identify problematic endpoints.
 */
export const slowRequestsTotal = new Counter({
  name: 'http_slow_requests_total',
  help: 'Total number of HTTP requests that exceeded the slow-request threshold',
  labelNames: ['method', 'route'] as const,
});

// ── Database Metrics ──────────────────────────────────────────────────────────

/** Histogram tracking database query duration in seconds, labeled by operation (select, insert, update, delete). */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

/** Counter for slow database queries (those exceeding SLOW_QUERY_THRESHOLD_MS). */
export const slowDbQueriesTotal = new Counter({
  name: 'db_slow_queries_total',
  help: 'Total number of database queries that exceeded the slow-query threshold',
  labelNames: ['operation'] as const,
});

// ── Redis / Cache Metrics ─────────────────────────────────────────────────────

/** Counter tracking Redis cache hits. */
export const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of Redis cache hits',
});

/** Counter tracking Redis cache misses. */
export const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of Redis cache misses',
});

// ── WebSocket Metrics ─────────────────────────────────────────────────────────

/** Gauge tracking the number of active WebSocket connections. */
export const activeWebSocketConnections = new Gauge({
  name: 'websocket_active_connections',
  help: 'Number of currently active WebSocket connections',
});

// ── Cron Job Metrics (existing) ───────────────────────────────────────────────

export const cronSessionsDeleted = new Counter({
  name: 'cron_sessions_deleted_total',
  help: 'Total expired user_sessions rows deleted by cleanup cron',
});

export const cronResetTokensDeleted = new Counter({
  name: 'cron_reset_tokens_deleted_total',
  help: 'Total expired password_reset_tokens rows deleted by cleanup cron',
});

export const cronPredictionsDeleted = new Counter({
  name: 'cron_predictions_deleted_total',
  help: 'Total expired prediction rows deleted by cleanup cron',
});

export const cronNotificationsSoftDeleted = new Counter({
  name: 'cron_notifications_soft_deleted_total',
  help: 'Total notification_jobs rows soft-deleted by cleanup cron',
});

export const cronDistributionsArchived = new Counter({
  name: 'cron_distributions_archived_total',
  help: 'Total failed distributions rows archived by cleanup cron',
});

export const cronBlockchainEventsDeleted = new Counter({
  name: 'cron_blockchain_events_deleted_total',
  help: 'Total processed blockchain_events rows deleted by cleanup cron',
});

export type MetricsExportFormat = 'json' | 'csv';

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function exportMetrics(format: MetricsExportFormat): Promise<string> {
  const metrics = await register.getMetricsAsJSON();
  if (format === 'json') return JSON.stringify(metrics);

  const rows = ['name,type,help,labels,value'];
  for (const metric of metrics) {
    for (const sample of metric.values) {
      rows.push([
        metric.name,
        metric.type,
        metric.help,
        JSON.stringify(sample.labels),
        String(sample.value),
      ].map(escapeCsv).join(','));
    }
  }
  return rows.join('\r\n');
}

export { register };

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Requests taking longer than this (ms) are counted as slow and logged. */
export const SLOW_REQUEST_THRESHOLD_MS = 1000;

/** DB queries taking longer than this (ms) are counted as slow and logged. */
export const SLOW_QUERY_THRESHOLD_MS = 500;

