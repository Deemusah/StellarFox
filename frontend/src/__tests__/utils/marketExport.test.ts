import { fetchMarkets } from '../../services/api';
import { fetchAllMarkets, serializeMarketData } from '../../utils/marketExport';
import type { Market } from '../../types';

jest.mock('../../services/api', () => ({
  fetchMarkets: jest.fn(),
}));

const sampleMarket = {
  market_id: 'market-1',
  fighter_a: 'Canelo, "The Champ"',
  fighter_b: 'Gennady Golovkin',
  weight_class: 'Middleweight',
  title_fight: false,
  status: 'open',
  pool_a: '500',
  pool_b: '300',
  pool_draw: '0',
  total_pool: '800',
} as Market;

describe('market exports', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serializes all market columns as correctly escaped CSV', () => {
    const csv = serializeMarketData([sampleMarket], 'csv');
    const [header, row] = csv.split('\r\n');

    expect(header).toContain('resolution_tx_hash');
    expect(header).toContain('ledger_sequence');
    expect(row).toContain('"Canelo, ""The Champ"""');
  });

  it('serializes complete market records as JSON', () => {
    expect(JSON.parse(serializeMarketData([sampleMarket], 'json'))).toEqual([sampleMarket]);
  });

  it('fetches every filtered page for the export', async () => {
    const secondMarket = { ...sampleMarket, market_id: 'market-2' };
    jest.mocked(fetchMarkets)
      .mockResolvedValueOnce({ markets: [sampleMarket], total: 2, page: 1, limit: 200 })
      .mockResolvedValueOnce({ markets: [secondMarket], total: 2, page: 2, limit: 200 });

    const filters = { status: 'open', search: 'Canelo' };
    await expect(fetchAllMarkets(filters)).resolves.toEqual([sampleMarket, secondMarket]);
    expect(fetchMarkets).toHaveBeenNthCalledWith(1, filters, { page: 1, limit: 200 });
    expect(fetchMarkets).toHaveBeenNthCalledWith(2, filters, { page: 2, limit: 200 });
  });
});