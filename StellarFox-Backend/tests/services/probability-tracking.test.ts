import { getProbabilityHistory, recordProbabilitySnapshot, recordProbabilitySnapshots } from '../../src/services/MarketService';
import { pool } from '../../src/config/db';

jest.mock('../../src/config/db', () => ({
  pool: { query: jest.fn() },
}));

const query = jest.mocked(pool.query);

describe('market probability tracking', () => {
  beforeEach(() => query.mockReset());

  it('records interval snapshots at one-minute boundaries for active markets', async () => {
    query.mockResolvedValueOnce({ rows: [{ market_id: 'mkt-1' }] } as never);

    await expect(recordProbabilitySnapshots()).resolves.toBe(1);

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("date_trunc('minute', statement_timestamp())");
    expect(sql).toContain("WHERE status IN ('open', 'locked')");
    expect(sql).toContain("ON CONFLICT (market_id, sampled_at, source) DO NOTHING");
    expect(sql).toContain('ELSE 1.0 / 3.0');
  });

  it('records event-driven snapshots for a single market', async () => {
    query.mockResolvedValueOnce({ rows: [] } as never);

    await recordProbabilitySnapshot('mkt-1');

    expect(query.mock.calls[0][0]).toContain("SELECT market_id, 'event'");
    expect(query.mock.calls[0][1]).toEqual(['mkt-1']);
  });

  it('returns filtered probability history in chronological order', async () => {
    const sampledAt = new Date('2026-10-18T11:30:00.000Z');
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never)
      .mockResolvedValueOnce({
        rows: [{
          market_id: 'mkt-1',
          sampled_at: sampledAt,
          source: 'interval',
          probability_a: '0.6000000000',
          probability_b: '0.3000000000',
          probability_draw: '0.1000000000',
          pool_a: '6000',
          pool_b: '3000',
          pool_draw: '1000',
          total_pool: '10000',
        }],
      } as never);
    const from = new Date('2026-10-18T11:00:00.000Z');
    const to = new Date('2026-10-18T12:00:00.000Z');

    await expect(getProbabilityHistory('mkt-1', { from, to, limit: 50 })).resolves.toEqual([{
      market_id: 'mkt-1',
      sampled_at: sampledAt,
      source: 'interval',
      probability_a: 0.6,
      probability_b: 0.3,
      probability_draw: 0.1,
      pool_a: '6000',
      pool_b: '3000',
      pool_draw: '1000',
      total_pool: '10000',
    }]);
    expect(query.mock.calls[1][1]).toEqual(['mkt-1', from, to, 50]);
    expect(query.mock.calls[1][0]).toContain('ORDER BY sampled_at ASC');
  });

  it('reports unknown markets rather than returning an indistinguishable empty history', async () => {
    query.mockResolvedValueOnce({ rows: [] } as never);

    await expect(getProbabilityHistory('missing', { limit: 100 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
