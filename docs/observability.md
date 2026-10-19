# Observability Guide

BANKERCHANGER exports Prometheus metrics, structured logs, and Sentry error tracking for production monitoring.
On top of the metrics themselves the repository now ships a complete monitoring stack — Prometheus, Alertmanager
and Grafana — under [`monitoring/`](../monitoring).

## Contents

- [Quick start](#quick-start)
- [Prometheus Metrics](#prometheus-metrics)
- [Monitoring stack](#monitoring-stack)
- [Alerting Rules](#alerting-rules)
- [Grafana Dashboards](#grafana-dashboards)
- [Alertmanager](#alertmanager)
- [Structured Logging](#structured-logging)
- [Error Tracking](#error-tracking)

## Quick start

```bash
# From the repository root — brings up the app stack plus Prometheus,
# Alertmanager and Grafana:
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d

# Or start only the monitoring services against an already running stack:
docker compose -f docker-compose.monitoring.yml up -d
```

| Service | URL | Notes |
|---------|-----|-------|
| Prometheus | http://localhost:9090 | Targets → `bankerchanger-backend`, Alerts → rule state |
| Alertmanager | http://localhost:9093 | Silence + grouping state |
| Grafana | http://localhost:3003 | Login `admin` / `admin`, folder `BANKERCHANGER` |
| Backend metrics | http://localhost:3001/metrics | Prometheus exposition format, internal only |

The overlay lives in [`docker-compose.monitoring.yml`](../docker-compose.monitoring.yml) so the default
`docker compose up` behaviour is unchanged.

## Prometheus Metrics

All metrics are exported via `GET /metrics` in Prometheus exposition format. This endpoint is internal-only and should not be exposed publicly.

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duration of HTTP requests in seconds |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total number of HTTP requests |

**Histogram buckets:** 10ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

### Database Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `db_query_duration_seconds` | Histogram | `operation` | Duration of database queries in seconds |

**Labels:** `operation` = `select`, `insert`, `update`, `delete`

**Histogram buckets:** 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, 5s

### Cache Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cache_hits_total` | Counter | — | Total Redis cache hits |
| `cache_misses_total` | Counter | — | Total Redis cache misses |

**Cache hit rate:** `rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))`

### WebSocket Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `websocket_active_connections` | Gauge | — | Currently active WebSocket connections |

### Cron Job Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `cron_sessions_deleted_total` | Counter | — | Expired user sessions deleted by cleanup cron |
| `cron_reset_tokens_deleted_total` | Counter | — | Expired password reset tokens deleted |
| `cron_notifications_soft_deleted_total` | Counter | — | Notification jobs soft-deleted |
| `cron_distributions_archived_total` | Counter | — | Failed distributions archived |
| `cron_blockchain_events_deleted_total` | Counter | — | Processed blockchain events deleted |

### Node.js Default Metrics

Default `prom-client` metrics are also collected, including:

- `nodejs_eventloop_lag_seconds` — Event loop lag (plus `_p50_`, `_p90_`, `_p99_`, `_max_` variants)
- `nodejs_active_handles_total` — Active handles
- `nodejs_active_resources_total` — Active handles, requests and timers
- `nodejs_heap_size_total_bytes` / `nodejs_heap_size_used_bytes` — V8 heap limit vs. usage
- `nodejs_external_memory_bytes` — Memory held outside the V8 heap
- `process_cpu_seconds_total` — CPU usage (`process_cpu_user_seconds_total`, `process_cpu_system_seconds_total`)
- `process_resident_memory_bytes` — Resident set size
- `process_start_time_seconds` — Process start time

Every sample also carries the default label `app="bankerchanger"`.

## Monitoring stack

```
monitoring/
├── prometheus/
│   ├── prometheus.yml              # scrape config + rule_files + alertmanager wiring
│   └── rules/
│       ├── alerts.yml              # alerting rules
│       └── recording-rules.yml     # pre-aggregated series used by the dashboards
├── alertmanager/
│   └── alertmanager.yml            # grouping, routing, inhibition
└── grafana/
    ├── provisioning/
    │   ├── datasources/prometheus.yml
    │   └── dashboards/dashboards.yml
    └── dashboards/
        ├── bankerchanger-overview.json
        └── bankerchanger-node-runtime.json
```

[`monitoring/prometheus/prometheus.yml`](../monitoring/prometheus/prometheus.yml) scrapes the backend every 15s:

```yaml
scrape_configs:
  - job_name: 'bankerchanger-backend'
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:3001']
        labels:
          service: backend
```

## Alerting rules

[`monitoring/prometheus/rules/alerts.yml`](../monitoring/prometheus/rules/alerts.yml) defines every alert
below. Rules are evaluated every 30s.

| Alert | Severity | For | Condition |
|-------|----------|-----|-----------|
| `BackendTargetDown` | critical | 2m | `up{job="bankerchanger-backend"} == 0` |
| `BackendMetricsMissing` | critical | 5m | `absent(http_requests_total{job="bankerchanger-backend"})` |
| `HighHttpErrorRate` | warning | 10m | 5xx ratio over all requests > 5% (5m) |
| `SlowHttpRequests` | warning | 10m | `histogram_quantile(0.95, …)` of `http_request_duration_seconds` > 2s |
| `LowCacheHitRate` | warning | 15m | Redis hit ratio < 50% (5m) |
| `DatabaseQueryLatencyHigh` | warning | 10m | `histogram_quantile(0.95, …)` of `db_query_duration_seconds` > 500ms |
| `WebSocketConnectionsHigh` | warning | 5m | `websocket_active_connections` > 1000 |
| `EventLoopLagHigh` | warning | 10m | `nodejs_eventloop_lag_p99_seconds` > 0.5 |
| `HeapMemoryPressure` | critical | 15m | used / total V8 heap > 90% |
| `CpuSaturation` | warning | 15m | `rate(process_cpu_seconds_total[5m])` > 1.5 cores |

PromQL behind each threshold:

| Alert | PromQL |
|-------|--------|
| High error rate | `rate(http_requests_total{status_code=~".."}[5m]) / rate(http_requests_total[5m])` |
| Slow requests | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` |
| Low cache hit rate | `rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))` |
| DB query latency | `histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))` |
| WebSocket overload | `websocket_active_connections` |

### Recording rules

[`monitoring/prometheus/rules/recording-rules.yml`](../monitoring/prometheus/rules/recording-rules.yml)
pre-aggregates the expensive expressions so dashboards stay cheap to render:

| Recorded series | Meaning |
|-----------------|---------|
| `job:http_requests:rate5m` | Requests/second per route |
| `job:http_requests:error_rate5m` | 5xx/second per route |
| `job:http_request_duration_seconds:p95_5m` | p95 HTTP latency |
| `job:db_query_duration_seconds:p95_5m` | p95 database latency |
| `job:cache_hit_rate:ratio5m` | Cache hit ratio (0..1) |

## Grafana Dashboards

Dashboards are provisioned automatically from `monitoring/grafana/dashboards`. They live in the
`BANKERCHANGER` folder and use the `bankerchanger-prometheus` datasource.

### BANKERCHANGER — Service Overview

`uid: bankerchanger-overview` — availability, throughput, error rate, latency, cache efficiency
and realtime load.

| Panel | Query |
|-------|-------|
| Backend Up | `max(up{job="bankerchanger-backend"})` |
| 5xx Error Rate (5m) | `sum(rate(http_requests_total{status_code=~".."}[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 0.001)` |
| HTTP Latency p95 | `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))` |
| Active WebSocket Connections | `websocket_active_connections` |
| Request Throughput by Route | `sum by (route) (rate(http_requests_total[5m]))` |
| Responses by Status Code | `sum by (status_code) (rate(http_requests_total[5m]))` |
| HTTP Latency Percentiles | `histogram_quantile(0.50 \| 0.95 \| 0.99, …)` |
| Database Query Latency p95 | `histogram_quantile(0.95, sum by (le, operation) (rate(db_query_duration_seconds_bucket[5m])))` |
| Cache Hit Rate | `sum(rate(cache_hits_total[5m])) / clamp_min(sum(rate(cache_hits_total[5m])) + sum(rate(cache_misses_total[5m])), 0.001)` |
| Realtime & Cron Activity | `websocket_active_connections`, `rate(cron_sessions_deleted_total[5m])`, `rate(cron_blockchain_events_deleted_total[5m])` |

### BANKERCHANGER — Node.js Runtime

`uid: bankerchanger-node-runtime` — event loop lag, V8 heap pressure, CPU and active handles.

| Panel | Query |
|-------|-------|
| Process Uptime | `time() - process_start_time_seconds` |
| Resident Memory | `process_resident_memory_bytes` |
| Heap Pressure | `nodejs_heap_size_used_bytes / clamp_min(nodejs_heap_size_total_bytes, 1)` |
| Event Loop Lag | `nodejs_eventloop_lag_p50_seconds`, `nodejs_eventloop_lag_p99_seconds`, `nodejs_eventloop_lag_max_seconds` |
| V8 Heap | `nodejs_heap_size_used_bytes`, `nodejs_heap_size_total_bytes`, `nodejs_external_memory_bytes` |
| CPU Usage | `rate(process_cpu_user_seconds_total[5m])`, `rate(process_cpu_system_seconds_total[5m])` |
| Active Handles | `nodejs_active_resources_total`, `nodejs_active_handles_total` |

### Importing a dashboard manually

```bash
# Grafana UI → Dashboards → New → Import → upload the JSON from
# monitoring/grafana/dashboards/, then pick the "Prometheus" datasource.
```

## Alertmanager

[`monitoring/alertmanager/alertmanager.yml`](../monitoring/alertmanager/alertmanager.yml) groups alerts by
`alertname` + `service`, routes `severity = critical` to a fast sink, routes `service = backend` to the
backend team, and inhibits matching warnings while a critical alert is already firing.

Receivers ship empty on purpose so no credentials live in the repository. Add an integration when you
wire up real delivery:

```yaml
receivers:
  - name: critical
    slack_configs:
      - api_url: $SLACK_WEBHOOK_URL     # inject via your secret manager
        channel: '#incidents'
        title: '{{ .CommonLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
```

Silence a noisy alert from the Alertmanager UI, or temporarily in a deployment pipeline:

```bash
amtool silence add alertname=LowCacheHitRate --duration=1h --comment='redis failover in progress'
```

## Verifying the setup

`backend/tests/monitoring/monitoring.test.ts` guards the whole stack: it checks that the scrape config
points at the `/metrics` route the Express app registers, that every alert rule and dashboard query only
references metric names the backend really exports, that Alertmanager routes resolve to declared
receivers, that the Grafana dashboards parse and are wired to the provisioned datasource, and that the
`prom-client` registry renders a valid exposition.

```bash
cd backend
npm test -- tests/monitoring
```

## Structured Logging

BANKERCHANGER uses [Pino](https://getpino.io/) for structured JSON logging.

**Log levels:** `trace`, `debug`, `info`, `warn`, `error`, `fatal`

**Log fields per request:**

- `req.method` — HTTP method
- `req.url` — Request URL
- `res.statusCode` — Response status
- `responseTime` — Request duration in ms

## Error Tracking

[Sentry](https://sentry.io/) is used for unhandled exception and rejection tracking.

**Configuration:** Set `SENTRY_DSN` in environment variables. Sentry is initialized on startup and captures:

- Unhandled promise rejections
- Uncaught exceptions
- Errors passed to `next(err)` in Express

## Further reading

- [Operational Runbook](runbook.md) — what to do once an alert fires
- [API Rate Limits](api-rate-limits.md) — the headers behind the rate-limit metrics