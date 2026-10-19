import { LogAggregator, LogEntry, LogQuery } from '../services/logAggregator';
import { Logger } from '../services/logger';

describe('LogAggregator', () => {
  let aggregator: LogAggregator;

  beforeEach(() => {
    aggregator = new LogAggregator();
  });

  const makeEntry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
    timestamp: new Date('2024-01-01T00:00:00.000Z'),
    level: 'info',
    service: 'api',
    message: 'hello world',
    ...overrides,
  });

  describe('ingest', () => {
    it('stores ingested log entries', () => {
      aggregator.ingest(makeEntry());
      expect(aggregator.size()).toBe(1);
    });

    it('stores multiple entries in order', () => {
      aggregator.ingest(makeEntry({ message: 'first' }));
      aggregator.ingest(makeEntry({ message: 'second' }));
      const results = aggregator.search({});
      expect(results.map((e) => e.message)).toEqual(['first', 'second']);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      aggregator.ingest(makeEntry({ level: 'info', service: 'api', message: 'request received' }));
      aggregator.ingest(makeEntry({ level: 'error', service: 'api', message: 'request failed' }));
      aggregator.ingest(makeEntry({ level: 'info', service: 'worker', message: 'job started' }));
    });

    it('returns all entries when query is empty', () => {
      expect(aggregator.search({})).toHaveLength(3);
    });

    it('filters by level', () => {
      const results = aggregator.search({ level: 'error' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('request failed');
    });

    it('filters by service', () => {
      const results = aggregator.search({ service: 'worker' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('job started');
    });

    it('filters by text across message', () => {
      const results = aggregator.search({ text: 'request' });
      expect(results).toHaveLength(2);
    });

    it('filters by time range', () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2024-01-01T00:00:00.000Z');
      const results = aggregator.search({ from, to });
      expect(results).toHaveLength(3);
    });

    it('combines multiple filters', () => {
      const results = aggregator.search({ level: 'info', service: 'api' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('request received');
    });

    it('returns empty array when nothing matches', () => {
      expect(aggregator.search({ service: 'missing' })).toEqual([]);
    });
  });

  describe('forwarding', () => {
    it('forwards logger output to the aggregator', () => {
      const logger = new Logger();
      logger.forwardTo(aggregator);
      logger.info('api', 'forwarded message');
      const results = aggregator.search({ text: 'forwarded message' });
      expect(results).toHaveLength(1);
      expect(results[0].level).toBe('info');
      expect(results[0].service).toBe('api');
    });

    it('forwards error level logs', () => {
      const logger = new Logger();
      logger.forwardTo(aggregator);
      logger.error('worker', 'boom');
      const results = aggregator.search({ level: 'error' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('boom');
    });
  });
});
