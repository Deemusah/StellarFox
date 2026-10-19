import { performance } from 'node:perf_hooks';
import { setDbAdapter, getMarkets } from '../../src/services/MarketService';
import type { Market } from '../../src/models/Market';

jest.mock('../../src/services/cache.service', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delPattern: jest.fn().mockResolvedValue(undefined),
}));

function makeMarkets(count: number): Market[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    market_id: `benchmark-${index}`,
    contract_address: 'C...',
    match_id: `fight-${index}`,
    fighter_a: `Fighter ${index}`,
    fighter_b: `Opponent ${index}`,
    weight_class: index % 2 === 0 ? 'Heavyweight' : 'Lightweight',
    title_fight: false,
    venue: index % 200 === 0 ? 'Championship Arena' : 'Local Arena',
    scheduled_at: new Date('2026-06-15T00:00:00Z'),
    status: index % 2 === 0 ? 'open' : 'resolved',
    outcome: null,
    pool_a: '0',
    pool_b: '0',
    pool_draw: '0',
    total_pool: '0',
    fee_bps: 200,
    lock_before_secs: 3600,
    resolved_at: null,
    oracle_used: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ledger_sequence: index,
  }));
}

describe('market search/filter benchmark', () => {
  it('searches and filters 20,000 markets under 200ms', async () => {
    const markets = makeMarkets(20_000);
    setDbAdapter({
      findMarkets: jest.fn().mockResolvedValue(markets),
      findMarketById: jest.fn(),
      findBetsByAddress: jest.fn(),
      findBetsByMarket: jest.fn(),
      updateMarketStatus: jest.fn(),
    });

    const start = performance.now();
    const result = await getMarkets(
      {
        search: 'championship arena',
        status: 'open',
        category: 'heavyweight',
        dateFrom: new Date('2026-06-01T00:00:00Z'),
        dateTo: new Date('2026-06-30T23:59:59Z'),
      },
      { page: 1, limit: 20 },
    );
    const elapsedMs = performance.now() - start;

    expect(result.total).toBe(100);
    expect(result.markets).toHaveLength(20);
    expect(elapsedMs).toBeLessThan(200);
  });
});
