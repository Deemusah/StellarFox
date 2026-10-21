// ============================================================
// BANKERCHANGER — useMarket Hook
// ============================================================

import type { Market } from '../types';
import { useMarketUpdates } from './useMarketUpdates';

export interface UseMarketResult {
  market: Market | null;
  isLoading: boolean;
  error: Error | null;
  isNotFound: boolean;
}

/**
 * Fetches a single market's full detail by market_id with real-time updates.
 * 
 * Uses WebSocket for real-time updates when available, with HTTP polling fallback.
 * Polls every 10 seconds while market.status is "open" or "locked".
 * Stops polling when status moves to "resolved" or "cancelled".
 *
 * @param market_id - The ID of the market to fetch
 * @returns Market data and loading/error states
 */
export function useMarket(market_id: string): UseMarketResult {
  // Use the real-time updates hook which handles WebSocket + fallback polling
  const { market, isLoading, error, isNotFound } = useMarketUpdates(market_id);

  return { market, isLoading, error, isNotFound };
}
