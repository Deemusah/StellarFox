// ============================================================
// BANKERCHANGER — useWatchlist Hook
// Manages the authenticated user's market watchlist.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../services/api';
import type { WatchlistMarket } from '../types';

export interface UseWatchlistResult {
  watchlist: WatchlistMarket[];
  isLoading: boolean;
  error: Error | null;
  /** Add a market to the watchlist; re-fetches on success */
  add: (marketId: string) => Promise<void>;
  /** Remove a market from the watchlist; optimistically updates local state */
  remove: (marketId: string) => Promise<void>;
  /** Trigger a manual re-fetch */
  refetch: () => void;
}

export function useWatchlist(token?: string): UseWatchlistResult {
  const [watchlist, setWatchlist] = useState<WatchlistMarket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    fetchWatchlist(token)
      .then((data) => {
        setWatchlist(data);
        setError(null);
      })
      .catch((e) => setError(e as Error))
      .finally(() => setIsLoading(false));
  }, [token, tick]);

  const add = useCallback(
    async (marketId: string) => {
      if (!token) throw new Error('Not authenticated');
      await addToWatchlist(marketId, token);
      // Re-fetch to get full market data for the newly watchlisted entry
      setTick((t) => t + 1);
    },
    [token],
  );

  const remove = useCallback(
    async (marketId: string) => {
      if (!token) throw new Error('Not authenticated');
      await removeFromWatchlist(marketId, token);
      // Optimistic update — remove immediately from local state
      setWatchlist((prev) => prev.filter((m) => m.id !== marketId));
    },
    [token],
  );

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { watchlist, isLoading, error, add, remove, refetch };
}
