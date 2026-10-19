import { fetchMarkets, type MarketFilters } from '../services/api';
import type { Market } from '../types';

const EXPORT_PAGE_SIZE = 200;

const MARKET_COLUMNS: (keyof Market)[] = [
  'id', 'market_id', 'contract_address', 'match_id', 'fighter_a', 'fighter_b',
  'weight_class', 'title_fight', 'venue', 'scheduled_at', 'status', 'outcome',
  'pool_a', 'pool_b', 'pool_draw', 'total_pool', 'fee_bps', 'resolved_at',
  'oracle_used', 'created_at', 'updated_at', 'ledger_sequence', 'odds_a',
  'odds_b', 'odds_draw', 'oracle_address', 'resolution_tx_hash',
];

export async function fetchAllMarkets(filters: MarketFilters): Promise<Market[]> {
  const markets: Market[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (markets.length < total) {
    const response = await fetchMarkets(filters, { page, limit: EXPORT_PAGE_SIZE });
    markets.push(...response.markets);
    total = response.total;
    if (response.markets.length === 0) break;
    page += 1;
  }

  return markets;
}

export function serializeMarketData(markets: Market[], format: 'csv' | 'json'): string {
  if (format === 'json') return JSON.stringify(markets, null, 2);

  const escapeCsv = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    MARKET_COLUMNS.join(','),
    ...markets.map((market) => MARKET_COLUMNS.map((column) => escapeCsv(market[column])).join(',')),
  ].join('\r\n');
}

export function downloadMarketData(markets: Market[], format: 'csv' | 'json'): void {
  const content = serializeMarketData(markets, format);
  const mimeType = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `markets-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}