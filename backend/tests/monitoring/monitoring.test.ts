/**
 * Monitoring & alerting configuration tests — issue #134.
 *
 * These tests are the safety net for the observability stack shipped in
 * `/monitoring`:
 *
 *   - the Prometheus scrape config still points at the `/metrics` route the
 *     backend actually registers,
 *   - every alert rule / dashboard query only references metric names that the
 *     backend really exports (so alerts never silently evaluate to "no data"),
 *   - Alertmanager routes reference receivers that exist,
 *   - the Grafana dashboards are valid, provisioned from disk and wired to the
 *     provisioned Prometheus datasource,
 *   - the backend metrics registry renders a valid Prometheus exposition.
 *
 * No database, Redis or Docker daemon is required — the suite only reads
 * configuration files plus the in-process prom-client registry.
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'yaml';

import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  dbQueryDuration,
  cacheHitsTotal,
  cacheMissesTotal,
  activeWebSocketConnections,
  cronSessionsDeleted,
  cronResetTokensDeleted,
  cronNotificationsSoftDeleted,
  cronDistributionsArchived,
  cronBlockchainEventsDeleted,
} from '../../src/services/metrics.service';

// ── Paths ───────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MONITORING_DIR = path.join(REPO_ROOT, 'monitoring');
const PROMETHEUS_DIR = path.join(MONITORING_DIR, 'prometheus');
const RULES_DIR = path.join(PROMETHEUS_DIR, 'rules');
const ALERTMANAGER_DIR = path.join(MONITORING_DIR, 'alertmanager');
const GRAFANA_DIR = path.join(MONITORING_DIR, 'grafana');
const GRAFANA_DASHBOARDS_DIR = path.join(GRAFANA_DIR, 'dashboards');
const GRAFANA_PROVISIONING_DIR = path.join(GRAFANA_DIR, 'provisioning');
const OBSERVABILITY_DOC = path.join(REPO_ROOT, 'docs', 'observability.md');
const BACKEND_ENTRYPOINT = path.join(REPO_ROOT, 'backend', 'src', 'index.ts');

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(...segments), 'utf8');
}

function readRepoJson<T>(...segments: string[]): T {
  return JSON.parse(readRepoFile(...segments)) as T;
}

function listFiles(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((entry) => entry.endsWith(extension)).sort();
}

// ── Domain knowledge ────────────────────────────────────────────────────────

/** Metric families (plus synthetic ones) the stack is allowed to query. */
const KNOWN_METRICS = new Set([
  // HTTP
  'http_request_duration_seconds',
  'http_request_duration_seconds_bucket',
  'http_request_duration_seconds_sum',
  'http_request_duration_seconds_count',
  'http_requests_total',
  // Database
  'db_query_duration_seconds',
  'db_query_duration_seconds_bucket',
  'db_query_duration_seconds_sum',
  'db_query_duration_seconds_count',
  // Cache
  'cache_hits_total',
  'cache_misses_total',
  // WebSocket
  'websocket_active_connections',
  // Cron jobs
  'cron_sessions_deleted_total',
  'cron_reset_tokens_deleted_total',
  'cron_notifications_soft_deleted_total',
  'cron_distributions_archived_total',
  'cron_blockchain_events_deleted_total',
  // process_* default metrics
  'process_cpu_user_seconds_total',
  'process_cpu_system_seconds_total',
  'process_cpu_seconds_total',
  'process_start_time_seconds',
  'process_resident_memory_bytes',
  // nodejs_* default metrics
  'nodejs_eventloop_lag_seconds',
  'nodejs_eventloop_lag_min_seconds',
  'nodejs_eventloop_lag_max_seconds',
  'nodejs_eventloop_lag_mean_seconds',
  'nodejs_eventloop_lag_stddev_seconds',
  'nodejs_eventloop_lag_p50_seconds',
  'nodejs_eventloop_lag_p90_seconds',
  'nodejs_eventloop_lag_p99_seconds',
  'nodejs_active_resources',
  'nodejs_active_resources_total',
  'nodejs_active_handles',
  'nodejs_active_handles_total',
  'nodejs_heap_size_total_bytes',
  'nodejs_heap_size_used_bytes',
  'nodejs_external_memory_bytes',
  'nodejs_version_info',
  'nodejs_gc_duration_seconds',
  'nodejs_gc_duration_seconds_sum',
  'nodejs_gc_duration_seconds_count',
  // Prometheus synthetic metrics
  'up',
  'scrape_duration_seconds',
]);

/** Label names and PromQL keywords that are not metrics. */
const ALLOWED_IDENTIFIERS = new Set([
  'app',
  'instance',
  'job',
  'le',
  'method',
  'operation',
  'quantile',
  'route',
  'service',
  'status_code',
  'and',
  'bool',
  'by',
  'group_left',
  'group_right',
  'ignoring',
  'offset',
  'on',
  'or',
  'unless',
  'without',
]);

/** PromQL functions the stack is allowed to use. */
const KNOWN_FUNCTIONS = new Set([
  'abs',
  'absent',
  'absent_over_time',
  'avg_over_time',
  'ceil',
  'changes',
  'clamp',
  'clamp_max',
  'clamp_min',
  'count_over_time',
  'day_of_week',
  'delta',
  'histogram_quantile',
  'holt_winters',
  'increase',
  'irate',
  'label_join',
  'label_replace',
  'last_over_time',
  'max',
  'max_over_time',
  'min',
  'min_over_time',
  'predict_linear',
  'quantile_over_time',
  'rate',
  'round',
  'scalar',
  'sort',
  'sort_desc',
  'stddev_over_time',
  'stdvar_over_time',
  'sum',
  'time',
  'timestamp',
  'vector',
]);

/** Alerts the runbook / on-call rotation depends on. */
const REQUIRED_ALERTS = [
  'BackendTargetDown',
  'BackendMetricsMissing',
  'HighHttpErrorRate',
  'SlowHttpRequests',
  'LowCacheHitRate',
  'DatabaseQueryLatencyHigh',
  'WebSocketConnectionsHigh',
  'EventLoopLagHigh',
  'HeapMemoryPressure',
  'CpuSaturation',
];

const VALID_SEVERITIES = ['critical', 'warning', 'info'];
const DURATION_PATTERN = /^(\d+)(s|m|h|d|w|y)$/;
const RECORDING_RULE_PATTERN = /^([a-z]+):([a-zA-Z_][a-zA-Z0-9_]*):([a-zA-Z][a-zA-Z0-9_]*)$/;

// ── Minimal PromQL analyser ─────────────────────────────────────────────────

interface PromQLAnalysis {
  functions: string[];
  identifiers: string[];
  unknownIdentifiers: string[];
  unknownFunctions: string[];
}

/**
 * Pull out every metric/label/function reference in a PromQL expression so the
 * rules and dashboard queries can be checked against KNOWN_METRICS.
 *
 * Deliberately conservative: string literals, range selectors, label
 * selectors and aggregation modifiers are stripped before identifiers are
 * collected, and function names are recorded separately.
 */
function analyzePromQL(expr: string): PromQLAnalysis {
  const functionCall = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const identifier = /\b[a-zA-Z_][a-zA-Z0-9_:]*\b/g;

  // Strip everything that can legally contain "noise" identifiers first, so
  // `sum by (le) (rate(x_bucket[5m]))` only yields the real metric reference.
  const stripped = expr
    .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
    .replace(/\[[^[\]]*\]/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\([^()]*\)/gi, ' ');

  const functions = new Set<string>();
  let match: RegExpExecArray | null = functionCall.exec(stripped);
  while (match !== null) {
    functions.add(match[1]);
    match = functionCall.exec(stripped);
  }

  const withoutFunctions = stripped.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, '(');

  const identifiers = new Set<string>();
  match = identifier.exec(withoutFunctions);
  while (match !== null) {
    identifiers.add(match[0]);
    match = identifier.exec(withoutFunctions);
  }

  const unknownIdentifiers = [...identifiers]
    .filter((name) => !KNOWN_METRICS.has(name) && !ALLOWED_IDENTIFIERS.has(name) && !functions.has(name))
    .sort();
  const unknownFunctions = [...functions].filter((name) => !KNOWN_FUNCTIONS.has(name)).sort();

  return {
    functions: [...functions].sort(),
    identifiers: [...identifiers].sort(),
    unknownIdentifiers,
    unknownFunctions,
  };
}

// ── Parsed configuration ───────────────────────────────────────────────────

interface AlertRule {
  alert?: string;
  record?: string;
  expr?: string;
  for?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface RuleGroup {
  name?: string;
  interval?: string;
  rules?: AlertRule[];
}

interface RuleFile {
  groups?: RuleGroup[];
}

interface PrometheusAlertmanager {
  static_configs?: Array<{ targets?: string[] }>;
}

interface PrometheusConfig {
  global?: { scrape_interval?: string; evaluation_interval?: string; external_labels?: Record<string, string> };
  rule_files?: string[];
  alerting?: { alertmanagers?: PrometheusAlertmanager[] };
  scrape_configs?: Array<{
    job_name?: string;
    metrics_path?: string;
    scrape_interval?: string;
    static_configs?: Array<{ targets?: string[] }>;
  }>;
}

interface AlertmanagerConfig {
  global?: { resolve_timeout?: string };
  route?: {
    receiver?: string;
    group_by?: string[];
    group_wait?: string;
    group_interval?: string;
    repeat_interval?: string;
    routes?: Array<{ receiver?: string; matchers?: string[] }>;
  };
  inhibit_rules?: Array<{ source_matchers?: string[]; target_matchers?: string[]; equal?: string[] }>;
  receivers?: Array<{ name?: string }>;
}

interface GrafanaDatasourceConfig {
  apiVersion?: number;
  datasources?: Array<{ name?: string; uid?: string; type?: string; url?: string; isDefault?: boolean }>;
}

interface GrafanaDashboardProviderConfig {
  apiVersion?: number;
  providers?: Array<{ name?: string; type?: string; options?: { path?: string } }>;
}

interface GrafanaTarget {
  expr?: string;
  refId?: string;
  legendFormat?: string;
  datasource?: { type?: string; uid?: string };
}

interface GrafanaPanel {
  id?: number;
  title?: string;
  type?: string;
  gridPos?: { h?: number; w?: number; x?: number; y?: number };
  targets?: GrafanaTarget[];
  panels?: GrafanaPanel[];
}

interface GrafanaDashboard {
  uid?: string;
  title?: string;
  schemaVersion?: number;
  refresh?: string;
  tags?: string[];
  panels?: GrafanaPanel[];
}

interface ComposeFile {
  services?: Record<string, { image?: string; ports?: string[]; volumes?: Array<string | Record<string, unknown>> }>;
}

const PROMETHEUS_CONFIG: PrometheusConfig = parse(
  readRepoFile(PROMETHEUS_DIR, 'prometheus.yml'),
);
const RULE_FILES: Array<{ file: string; doc: RuleFile }> = listFiles(RULES_DIR, '.yml').map((file) => ({
  file,
  doc: parse(readRepoFile(RULES_DIR, file)),
}));
const ALERT_RULES: AlertRule[] = RULE_FILES.flatMap((entry) =>
  (entry.doc.groups ?? []).flatMap((group) => group.rules ?? []),
);
const RECORDING_RULES: AlertRule[] = ALERT_RULES.filter((rule) => typeof rule.record === 'string');
const ALERT_RULE_LIST: AlertRule[] = ALERT_RULES.filter((rule) => typeof rule.alert === 'string');

const ALERTMANAGER_CONFIG: AlertmanagerConfig = parse(
  readRepoFile(ALERTMANAGER_DIR, 'alertmanager.yml'),
);

const GRAFANA_DATASOURCE_CONFIG: GrafanaDatasourceConfig = parse(
  readRepoFile(GRAFANA_PROVISIONING_DIR, 'datasources', 'prometheus.yml'),
);
const GRAFANA_PROVIDER_CONFIG: GrafanaDashboardProviderConfig = parse(
  readRepoFile(GRAFANA_PROVISIONING_DIR, 'dashboards', 'dashboards.yml'),
);
const GRAFANA_DATASOURCE_UIDS = (GRAFANA_DATASOURCE_CONFIG.datasources ?? [])
  .filter((ds) => ds.type === 'prometheus')
  .map((ds) => ds.uid as string);

const DASHBOARD_FILES = listFiles(GRAFANA_DASHBOARDS_DIR, '.json');
const DASHBOARDS: Array<{ file: string; doc: GrafanaDashboard }> = DASHBOARD_FILES.map((file) => ({
  file,
  doc: readRepoJson<GrafanaDashboard>(GRAFANA_DASHBOARDS_DIR, file),
}));

const COMPOSE_CONFIG: ComposeFile = parse(readRepoFile(REPO_ROOT, 'docker-compose.monitoring.yml'));

/** Grafana row panels nest their children; flatten them for assertions. */
function flattenPanels(panels: GrafanaPanel[] | undefined): GrafanaPanel[] {
  const flat: GrafanaPanel[] = [];
  for (const panel of panels ?? []) {
    flat.push(panel);
    if (Array.isArray(panel.panels)) flat.push(...flattenPanels(panel.panels));
  }
  return flat;
}

// ── Prometheus scrape configuration ─────────────────────────────────────────

describe('Prometheus configuration', () => {
  it('ships the expected monitoring layout', () => {
    expect(fs.existsSync(PROMETHEUS_DIR)).toBe(true);
    expect(fs.existsSync(RULES_DIR)).toBe(true);
    expect(fs.existsSync(ALERTMANAGER_DIR)).toBe(true);
    expect(fs.existsSync(GRAFANA_DASHBOARDS_DIR)).toBe(true);
  });

  it('defines global scrape and evaluation intervals', () => {
    expect(PROMETHEUS_CONFIG.global?.scrape_interval).toMatch(DURATION_PATTERN);
    expect(PROMETHEUS_CONFIG.global?.evaluation_interval).toMatch(DURATION_PATTERN);
    expect(PROMETHEUS_CONFIG.global?.external_labels).toBeDefined();
  });

  it('scrapes the backend /metrics endpoint that the Express app registers', () => {
    const backendJob = (PROMETHEUS_CONFIG.scrape_configs ?? []).find(
      (job) => job.job_name === 'bankerchanger-backend',
    );
    expect(backendJob).toBeDefined();
    expect(backendJob?.metrics_path).toBe('/metrics');
    expect(backendJob?.scrape_interval).toMatch(DURATION_PATTERN);
    expect(backendJob?.static_configs?.[0]?.targets).toContain('backend:3001');

    // The scrape path is only useful if the app exposes exactly that route.
    const entrypoint = readRepoFile(BACKEND_ENTRYPOINT);
    expect(entrypoint).toMatch(/app\.get\(\s*["'`]\/metrics["'`]/);
    expect(entrypoint).toContain('register.metrics()');
  });

  it('loads the bundled rule files from the container mount point', () => {
    const ruleFiles = PROMETHEUS_CONFIG.rule_files ?? [];
    expect(ruleFiles.length).toBeGreaterThan(0);

    for (const ruleFile of ruleFiles) {
      expect(ruleFile.startsWith('/etc/prometheus/')).toBe(true);
    }

    // /etc/prometheus/rules in the container maps to monitoring/prometheus/rules.
    const referencedDirs = new Set(
      ruleFiles.map((ruleFile) => path.posix.basename(path.posix.dirname(ruleFile))),
    );
    expect([...referencedDirs]).toEqual(['rules']);
    expect(listFiles(RULES_DIR, '.yml').length).toBeGreaterThanOrEqual(2);
  });

  it('forwards firing alerts to the Alertmanager service', () => {
    const targets = (PROMETHEUS_CONFIG.alerting?.alertmanagers ?? []).flatMap(
      (alertmanager) => alertmanager.static_configs?.flatMap((config) => config.targets ?? []) ?? [],
    );
    expect(targets).toContain('alertmanager:9093');
  });
});

// ── Alerting rules ──────────────────────────────────────────────────────────

describe('alerting rules', () => {
  it('ships every alert the runbook depends on', () => {
    const names = ALERT_RULE_LIST.map((rule) => rule.alert as string);
    for (const required of REQUIRED_ALERTS) {
      expect(names).toContain(required);
    }
  });

  it('gives every alert a name, expression, duration, labels and annotations', () => {
    expect(ALERT_RULE_LIST.length).toBeGreaterThanOrEqual(REQUIRED_ALERTS.length);

    for (const rule of ALERT_RULE_LIST) {
      const name = rule.alert;
      expect(typeof name).toBe('string');
      expect((name as string).length).toBeGreaterThan(0);
      expect(typeof rule.expr).toBe('string');
      expect((rule.expr as string).trim().length).toBeGreaterThan(0);
      expect(rule.for).toMatch(DURATION_PATTERN);
      expect(rule.labels?.severity).toBeDefined();
      expect(VALID_SEVERITIES).toContain(rule.labels?.severity);
      expect(rule.annotations?.summary).toBeTruthy();
      expect(rule.annotations?.description).toBeTruthy();
      expect(rule.annotations?.runbook).toBeTruthy();
    }
  });

  it('groups rules under uniquely named groups with a valid evaluation interval', () => {
    const groupNames: string[] = [];
    for (const { doc } of RULE_FILES) {
      const groups = doc.groups ?? [];
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(typeof group.name).toBe('string');
        expect((group.rules ?? []).length).toBeGreaterThan(0);
        expect(group.interval).toMatch(DURATION_PATTERN);
        groupNames.push(group.name as string);
      }
    }
    expect(new Set(groupNames).size).toBe(groupNames.length);
  });

  it('only queries metrics that the backend actually exports', () => {
    const offenders: string[] = [];

    for (const rule of ALERT_RULE_LIST) {
      const analysis = analyzePromQL(rule.expr as string);
      if (analysis.unknownIdentifiers.length > 0 || analysis.unknownFunctions.length > 0) {
        offenders.push(
          `${rule.alert}: unknown=${analysis.unknownIdentifiers.join(',')} fn=${analysis.unknownFunctions.join(',')}`,
        );
      }
    }

    for (const rule of RECORDING_RULES) {
      const analysis = analyzePromQL(rule.expr as string);
      if (analysis.unknownIdentifiers.length > 0 || analysis.unknownFunctions.length > 0) {
        offenders.push(
          `${rule.record}: unknown=${analysis.unknownIdentifiers.join(',')} fn=${analysis.unknownFunctions.join(',')}`,
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it('pre-aggregates the expensive expressions as recording rules', () => {
    expect(RECORDING_RULES.length).toBeGreaterThan(0);

    const names: string[] = [];
    for (const rule of RECORDING_RULES) {
      const record = rule.record as string;
      expect(record).toMatch(RECORDING_RULE_PATTERN);
      names.push(record);
    }

    expect(names).toContain('job:http_requests:rate5m');
    expect(names).toContain('job:http_request_duration_seconds:p95_5m');
    expect(names).toContain('job:cache_hit_rate:ratio5m');
  });
});

// ── Alertmanager ────────────────────────────────────────────────────────────

describe('Alertmanager configuration', () => {
  it('declares a root route with a valid evaluation interval', () => {
    expect(ALERTMANAGER_CONFIG.global?.resolve_timeout).toMatch(DURATION_PATTERN);
    expect(ALERTMANAGER_CONFIG.route?.receiver).toBeTruthy();
    expect(ALERTMANAGER_CONFIG.route?.group_by?.length).toBeGreaterThan(0);
    expect(ALERTMANAGER_CONFIG.route?.group_wait).toMatch(DURATION_PATTERN);
    expect(ALERTMANAGER_CONFIG.route?.group_interval).toMatch(DURATION_PATTERN);
    expect(ALERTMANAGER_CONFIG.route?.repeat_interval).toMatch(DURATION_PATTERN);
  });

  it('routes to receivers that are actually declared', () => {
    const receivers = new Set((ALERTMANAGER_CONFIG.receivers ?? []).map((receiver) => receiver.name));
    expect(receivers.size).toBeGreaterThan(0);
    expect(receivers.has(ALERTMANAGER_CONFIG.route?.receiver as string)).toBe(true);

    for (const child of ALERTMANAGER_CONFIG.route?.routes ?? []) {
      expect(child.receiver).toBeTruthy();
      expect(receivers.has(child.receiver as string)).toBe(true);
      expect((child.matchers ?? []).length).toBeGreaterThan(0);
    }

    // Critical alerts need their own, faster sink.
    expect(receivers.has('critical')).toBe(true);
  });

  it('inhibits warning noise while a matching critical alert is firing', () => {
    const inhibitRules = ALERTMANAGER_CONFIG.inhibit_rules ?? [];
    expect(inhibitRules.length).toBeGreaterThan(0);

    for (const rule of inhibitRules) {
      expect((rule.source_matchers ?? []).length).toBeGreaterThan(0);
      expect((rule.target_matchers ?? []).length).toBeGreaterThan(0);
      expect((rule.equal ?? []).length).toBeGreaterThan(0);
    }
  });

  it('keeps notification credentials out of the repository', () => {
    const raw = readRepoFile(ALERTMANAGER_DIR, 'alertmanager.yml');
    expect(raw).not.toMatch(/slack_api_url|api_key|password:/i);
  });
});

// ── Grafana ─────────────────────────────────────────────────────────────────

describe('Grafana provisioning', () => {
  it('provisions a default Prometheus datasource', () => {
    expect(GRAFANA_DATASOURCE_CONFIG.apiVersion).toBe(1);

    const datasources = GRAFANA_DATASOURCE_CONFIG.datasources ?? [];
    expect(datasources.length).toBeGreaterThan(0);
    expect(GRAFANA_DATASOURCE_UIDS.length).toBeGreaterThan(0);

    const prometheus = datasources.find((ds) => ds.isDefault);
    expect(prometheus?.type).toBe('prometheus');
    expect(prometheus?.url).toBeTruthy();
    expect(prometheus?.uid).toBeTruthy();
  });

  it('loads dashboards from the directory that is bind-mounted by compose', () => {
    expect(GRAFANA_PROVIDER_CONFIG.apiVersion).toBe(1);

    const providers = GRAFANA_PROVIDER_CONFIG.providers ?? [];
    expect(providers.length).toBeGreaterThan(0);

    for (const provider of providers) {
      expect(provider.type).toBe('file');
      expect(provider.options?.path).toBeTruthy();
    }

    const providerPath = providers[0].options?.path as string;
    expect(path.posix.basename(providerPath)).toBe('dashboards');
    expect(DASHBOARD_FILES.length).toBeGreaterThan(0);
  });

  it('ships dashboards covering service health and Node.js runtime', () => {
    const uids = DASHBOARDS.map((entry) => entry.doc.uid);
    expect(uids).toContain('bankerchanger-overview');
    expect(uids).toContain('bankerchanger-node-runtime');
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('produces importable dashboards with wired-up panels', () => {
    for (const { file, doc } of DASHBOARDS) {
      expect(doc.uid).toMatch(/^[a-z0-9-]+$/);
      expect(doc.title).toBeTruthy();
      expect(doc.schemaVersion).toBeGreaterThanOrEqual(30);
      expect(doc.refresh).toMatch(DURATION_PATTERN);
      expect(Array.isArray(doc.tags) && doc.tags.length > 0).toBe(true);

      const panels = flattenPanels(doc.panels);
      expect(panels.length).toBeGreaterThanOrEqual(4);

      const panelIds = panels.map((panel) => panel.id);
      expect(panelIds.every((id) => typeof id === 'number')).toBe(true);
      expect(new Set(panelIds).size).toBe(panelIds.length);

      for (const panel of panels) {
        expect(panel.title).toBeTruthy();
        expect(typeof panel.gridPos?.h).toBe('number');
        expect(typeof panel.gridPos?.w).toBe('number');
        expect(typeof panel.gridPos?.x).toBe('number');
        expect(typeof panel.gridPos?.y).toBe('number');

        const targets = panel.targets ?? [];
        expect(targets.length).toBeGreaterThan(0);

        for (const target of targets) {
          expect(typeof target.expr).toBe('string');
          expect((target.expr as string).trim().length).toBeGreaterThan(0);
          expect(target.refId).toBeTruthy();
          expect(GRAFANA_DATASOURCE_UIDS).toContain(target.datasource?.uid);
        }

        // Make sure the file name and the dashboard title stay in sync.
        expect(file).toContain(doc.uid as string);
      }
    }
  });

  it('only queries metrics that the backend actually exports', () => {
    const offenders: string[] = [];

    for (const { doc } of DASHBOARDS) {
      for (const panel of flattenPanels(doc.panels)) {
        for (const target of panel.targets ?? []) {
          const analysis = analyzePromQL(target.expr as string);
          if (analysis.unknownIdentifiers.length > 0 || analysis.unknownFunctions.length > 0) {
            offenders.push(
              `${doc.uid}/${panel.title}: unknown=${analysis.unknownIdentifiers.join(',')} fn=${analysis.unknownFunctions.join(',')}`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

// ── Compose wiring ──────────────────────────────────────────────────────────

describe('monitoring compose overlay', () => {
  it('runs Prometheus, Alertmanager and Grafana', () => {
    const services = COMPOSE_CONFIG.services ?? {};
    expect(Object.keys(services).sort()).toEqual(['alertmanager', 'grafana', 'prometheus']);
  });

  it('pins image tags instead of floating on latest', () => {
    const services = COMPOSE_CONFIG.services ?? {};
    const serviceNames = Object.keys(services);
    expect(serviceNames.length).toBeGreaterThan(0);

    for (const name of serviceNames) {
      const image = services[name].image;
      expect(typeof image).toBe('string');
      expect(image).not.toMatch(/:latest$/);
      expect(image).toMatch(/^[a-z0-9./-]+:[a-z0-9][a-z0-9.-]*$/);
    }
  });

  it('bind-mounts configuration files that exist in the repository', () => {
    const services = COMPOSE_CONFIG.services ?? {};
    let bindMounts = 0;

    for (const service of Object.values(services)) {
      for (const volume of service.volumes ?? []) {
        if (typeof volume !== 'string') continue;
        const hostPath = volume.split(':')[0];
        if (!hostPath.startsWith('./') && !hostPath.startsWith('../')) continue;

        bindMounts += 1;
        expect(fs.existsSync(path.resolve(REPO_ROOT, hostPath))).toBe(true);
      }
    }

    expect(bindMounts).toBeGreaterThanOrEqual(4);
  });
});

// ── Documentation ───────────────────────────────────────────────────────────

describe('observability documentation', () => {
  const doc = readRepoFile(OBSERVABILITY_DOC);

  it('documents every alert that can fire', () => {
    for (const rule of ALERT_RULE_LIST) {
      expect(doc).toContain(rule.alert as string);
    }
  });

  it('documents every provisioned dashboard', () => {
    for (const { doc: dashboard } of DASHBOARDS) {
      expect(doc).toContain(dashboard.uid as string);
      expect(doc).toContain(dashboard.title as string);
    }
  });

  it('documents the prom-client default metrics the dashboards rely on', () => {
    for (const metric of [
      'nodejs_eventloop_lag_seconds',
      'nodejs_heap_size_used_bytes',
      'process_resident_memory_bytes',
    ]) {
      expect(doc).toContain(metric);
    }
  });

  it('documents how to start the monitoring stack', () => {
    expect(doc).toContain('docker-compose.monitoring.yml');
    expect(doc).toContain('monitoring/prometheus/prometheus.yml');
  });
});

// ── Backend metrics registry ────────────────────────────────────────────────

describe('backend Prometheus registry', () => {
  beforeAll(() => {
    // Record at least one sample per family so the exposition is non-empty.
    httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '200' });
    httpRequestsTotal.inc({ method: 'GET', route: '/health', status_code: '500' });
    httpRequestDuration.observe({ method: 'GET', route: '/health', status_code: '200' }, 0.012);
    httpRequestDuration.observe({ method: 'GET', route: '/health', status_code: '500' }, 0.4);
    dbQueryDuration.observe({ operation: 'select' }, 0.003);
    dbQueryDuration.observe({ operation: 'insert' }, 0.02);
    cacheHitsTotal.inc();
    cacheMissesTotal.inc();
    activeWebSocketConnections.set(7);
    cronSessionsDeleted.inc(1);
    cronResetTokensDeleted.inc(2);
    cronNotificationsSoftDeleted.inc(3);
    cronDistributionsArchived.inc(4);
    cronBlockchainEventsDeleted.inc(5);
  });

  it('serves the Prometheus text exposition format', () => {
    expect(register.contentType).toContain('text/plain');
    expect(register.contentType).toMatch(/version=0\.0\.4/);
  });

  it('tags every metric family with a stable application label', () => {
    // prom-client applies these to every sample, so a shared Prometheus can tell
    // backend metrics apart from any other job it scrapes.
    const source = readRepoFile(REPO_ROOT, 'backend', 'src', 'services', 'metrics.service.ts');
    expect(source).toMatch(/setDefaultLabels\(\{\s*app:\s*'bankerchanger'\s*\}\)/);
  });

  it('exposes the HTTP request metrics documented in docs/observability.md', async () => {
    const exposition = await register.metrics();

    expect(exposition).toContain('# HELP http_requests_total');
    expect(exposition).toContain('# TYPE http_requests_total counter');
    expect(exposition).toContain('# TYPE http_request_duration_seconds histogram');
    expect(exposition).toContain('# TYPE db_query_duration_seconds histogram');

    // Histogram buckets must exist for histogram_quantile() to work.
    expect(exposition).toMatch(/http_request_duration_seconds_bucket\{[^}]*le="0.25"/);
    expect(exposition).toMatch(/db_query_duration_seconds_bucket\{[^}]*le="0.5"/);

    // Labels used by the dashboards and alerts. Histograms expose
    // `_bucket`/`_sum`/`_count` series rather than a bare sample line.
    expect(exposition).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*\}/);
    expect(exposition).toMatch(/http_requests_total\{[^}]*route="\/health"[^}]*\}/);
    expect(exposition).toMatch(/http_requests_total\{[^}]*status_code="200"[^}]*\}/);
    expect(exposition).toMatch(/http_request_duration_seconds_count\{[^}]*status_code="500"[^}]*\}/);
    expect(exposition).toMatch(/db_query_duration_seconds_count\{[^}]*operation="select"[^}]*\}/);
    expect(exposition).toMatch(/db_query_duration_seconds_count\{[^}]*operation="insert"[^}]*\}/);
  });

  it('exposes cache, WebSocket and cron metrics as documented', async () => {
    const exposition = await register.metrics();

    // These families carry no labelNames of their own — only the shared default
    // labels — so the label set is optional in the exposition.
    const sample = (name: string): RegExp => new RegExp(`^${name}(?:\\{[^}]*\\})? [1-9]`, 'm');

    expect(exposition).toMatch(sample('cache_hits_total'));
    expect(exposition).toMatch(sample('cache_misses_total'));
    expect(exposition).toMatch(/^websocket_active_connections(?:\{[^}]*\})? 7/m);

    for (const counter of [
      'cron_sessions_deleted_total',
      'cron_reset_tokens_deleted_total',
      'cron_notifications_soft_deleted_total',
      'cron_distributions_archived_total',
      'cron_blockchain_events_deleted_total',
    ]) {
      expect(exposition).toMatch(sample(counter));
    }
  });

  it('collects the default Node.js and process metrics', async () => {
    const exposition = await register.metrics();
    const families = new Set(
      Array.from(exposition.matchAll(/^# HELP ([a-zA-Z_:][a-zA-Z0-9_:]*) /gm)).map((match) => match[1]),
    );

    const runtimeFamilies = [...families].filter(
      (family) => family.startsWith('nodejs_') || family.startsWith('process_'),
    );

    expect(runtimeFamilies.length).toBeGreaterThanOrEqual(5);
    expect(runtimeFamilies.some((family) => family.startsWith('nodejs_'))).toBe(true);
    expect(runtimeFamilies.some((family) => family.startsWith('process_'))).toBe(true);

    // collectDefaultMetrics() must have registered the series the runtime
    // dashboard and the EventLoopLagHigh / HeapMemoryPressure alerts query.
    for (const family of [
      'process_start_time_seconds',
      'nodejs_heap_size_total_bytes',
      'nodejs_heap_size_used_bytes',
      'nodejs_external_memory_bytes',
      'nodejs_version_info',
    ]) {
      expect(families.has(family)).toBe(true);
    }
  });

  it('keeps counters monotonic so rate() never returns a negative value', async () => {
    const totalFor = (exposition: string, metric: string): number => {
      const pattern = new RegExp(`^${metric}(?:\\{[^}]*\\})? (\\d+(?:\\.\\d+)?)$`, 'gm');
      return Array.from(exposition.matchAll(pattern)).reduce(
        (total, match) => total + Number(match[1]),
        0,
      );
    };

    const before = await register.metrics();
    httpRequestsTotal.inc({ method: 'POST', route: '/api/markets', status_code: '201' });
    const after = await register.metrics();

    const previous = totalFor(before, 'http_requests_total');
    const current = totalFor(after, 'http_requests_total');

    expect(previous).toBeGreaterThan(0);
    expect(current).toBeGreaterThanOrEqual(previous);
    expect(current).toBeGreaterThan(previous);
  });
});