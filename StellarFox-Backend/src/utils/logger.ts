import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  time: number;
  service: string;
  msg: string;
  [key: string]: unknown;
}

export interface LogQuery {
  level?: LogLevel;
  service?: string;
  from?: number;
  to?: number;
  text?: string;
  limit?: number;
}

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'stellarfox-backend';
const MAX_BUFFER = Number(process.env.LOG_AGGREGATION_BUFFER ?? 1000);

/**
 * Centralized in-memory log aggregation sink. Services forward their log
 * entries here so logs are collected in one place and can be searched and
 * filtered without scattering them across processes.
 */
export class LogAggregator {
  private readonly entries: LogEntry[] = [];

  ingest(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > MAX_BUFFER) {
      this.entries.splice(0, this.entries.length - MAX_BUFFER);
    }
  }

  search(query: LogQuery = {}): LogEntry[] {
    const { level, service, from, to, text, limit } = query;
    const needle = text?.toLowerCase();

    const results = this.entries.filter((entry) => {
      if (level && entry.level !== level) return false;
      if (service && entry.service !== service) return false;
      if (from !== undefined && entry.time < from) return false;
      if (to !== undefined && entry.time > to) return false;
      if (needle && !entry.msg.toLowerCase().includes(needle)) return false;
      return true;
    });

    return limit !== undefined ? results.slice(-limit) : results;
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export const logAggregator = new LogAggregator();

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: SERVICE_NAME },
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

/**
 * Forwards a pino log record to the aggregation sink so logs from every
 * service end up centralized and searchable.
 */
function forwardToAggregator(obj: Record<string, unknown>): void {
  const level = (obj.level as LogLevel) ?? 'info';
  const time = typeof obj.time === 'number' ? obj.time : Date.now();
  const service = (obj.service as string) ?? SERVICE_NAME;
  const msg = typeof obj.msg === 'string' ? obj.msg : '';
  logAggregator.ingest({ ...obj, level, time, service, msg });
}

const forwardHook = (obj: Record<string, unknown>): void => forwardToAggregator(obj);

// Wire existing logger output to the aggregator via pino hooks.
export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: SERVICE_NAME },
    hooks: { logMethod: (args, method) => method.apply(baseLogger, args) },
    ...(isDev && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  },
  pino.multistream([
    { stream: process.stdout },
    {
      write(line: string): void {
        try {
          forwardHook(JSON.parse(line));
        } catch {
          // ignore non-JSON lines
        }
      },
    },
  ]),
);
