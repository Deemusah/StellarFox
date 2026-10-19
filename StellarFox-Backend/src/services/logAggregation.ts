/**
 * Log Aggregation service (issue #135).
 *
 * Provides a centralized in-process log sink that services can forward their
 * log output to, plus a search/filter API for troubleshooting. This is the
 * aggregation layer only: parsing rules, analytics, and retention policies
 * are explicitly out of scope.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogQuery {
  level?: LogLevel | LogLevel[];
  service?: string | string[];
  /** Inclusive lower bound (ISO timestamp). */
  from?: string;
  /** Inclusive upper bound (ISO timestamp). */
  to?: string;
  /** Case-insensitive substring match against the message. */
  text?: string;
  limit?: number;
}

export interface LogForwarder {
  forward(entry: LogEntry): void;
}

const DEFAULT_MAX_ENTRIES = 10_000;

function toArray<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * Centralized log aggregation sink. Holds forwarded log entries and exposes a
 * search/filter API. Bounded to avoid unbounded memory growth.
 */
export class LogAggregator {
  private readonly entries: LogEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Ingest a single log entry into the aggregation store. */
  ingest(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  /** Search and filter aggregated logs. */
  search(query: LogQuery = {}): LogEntry[] {
    const levels = toArray(query.level);
    const services = toArray(query.service);
    const from = query.from ? Date.parse(query.from) : undefined;
    const to = query.to ? Date.parse(query.to) : undefined;
    const text = query.text?.toLowerCase();

    const results = this.entries.filter((entry) => {
      if (levels && !levels.includes(entry.level)) return false;
      if (services && !services.includes(entry.service)) return false;

      if (from !== undefined || to !== undefined) {
        const ts = Date.parse(entry.timestamp);
        if (Number.isNaN(ts)) return false;
        if (from !== undefined && ts < from) return false;
        if (to !== undefined && ts > to) return false;
      }

      if (text && !entry.message.toLowerCase().includes(text)) return false;
      return true;
    });

    if (query.limit !== undefined && query.limit >= 0) {
      return results.slice(0, query.limit);
    }
    return results;
  }

  /** All aggregated entries (oldest first). */
  all(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

/**
 * Forwards log output from a service into a LogAggregator. Wraps an existing
 * logger so services can keep their current call sites while their output is
 * centralized.
 */
export class LogForwarderClient implements LogForwarder {
  constructor(
    private readonly aggregator: LogAggregator,
    private readonly service: string,
  ) {}

  forward(entry: LogEntry): void {
    this.aggregator.ingest(entry);
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    this.forward({
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      context,
    });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }
}

/** Shared process-wide aggregator used by services. */
export const logAggregator = new LogAggregator();

/** Create a forwarder bound to a service name and the shared aggregator. */
export function createLogForwarder(
  service: string,
  aggregator: LogAggregator = logAggregator,
): LogForwarderClient {
  return new LogForwarderClient(aggregator, service);
}
