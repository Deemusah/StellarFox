// ============================================================
// BANKERCHANGER — useInfiniteMarkets Hook
// Wraps fetchMarkets and accumulates results across pages so
// the caller can render all loaded markets at once (infinite
// scroll pattern).
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { Market } from '../types';
import type { MarketFilters } from '../services/api';
import { fetchMarkets } from '../services/api';

const DEFAULT_LIMIT = 12;

export interface UseInfiniteMarketsResult {
  /** All markets accumulated across pages fetched so far */
  markets: Market[];
  /** Total number of markets on the server (used to detect end of list) */
  total: number;
  /** True during the very first fetch (no data yet) */
  isLoading: boolean;
  /** True while a subsequent page is being fetched */
  isFetchingMore: boolean;
  /** Whether there are more pages to fetch */
  hasMore: boolean;
  /** Fetch the next page; no-op if already loading or no more pages */
  loadMore: () => void;
  /** Error from the most recent fetch (null when last fetch succeeded) */
  error: Error | null;
  /** Reset to page 1, clear accumulated data, then re-fetch */
  reset: () => void;
}

/**
 * Fetches markets page-by-page and accumulates them in state.
 * Call `loadMore()` (e.g. from a scroll sentinel) to append the next page.
 * Call `reset()` when filters change to start over.
 */
export function useInfiniteMarkets(
  filters?: MarketFilters,
  limit: number = DEFAULT_LIMIT,
): UseInfiniteMarketsResult {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the "generation" so stale responses from a previous filter set
  // are discarded if filters change before a fetch completes.
  const generationRef = useRef(0);

  // Serialize filters so the fetch can safely depend on the values
  const filtersKey = JSON.stringify(filters ?? null);

  const hasMore = markets.length < total || isLoading;

  const fetchPage = useCallback(
    async (targetPage: number, generation: number, append: boolean) => {
      try {
        const response = await fetchMarkets(
          filtersKey !== 'null' ? (JSON.parse(filtersKey) as MarketFilters) : undefined,
          { page: targetPage, limit },
        );

        // Discard result if a newer generation has started (filters changed)
        if (generationRef.current !== generation) return;

        setMarkets((prev) => (append ? [...prev, ...response.markets] : response.markets));
        setTotal(response.total);
        setPage(targetPage);
        setError(null);
      } catch (e) {
        if (generationRef.current !== generation) return;
        setError(e as Error);
      } finally {
        if (generationRef.current === generation) {
          setIsLoading(false);
          setIsFetchingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey, limit],
  );

  // Initial fetch — runs once on mount and whenever filters/limit change.
  // We use a ref-based guard so this effect is truly idempotent even in
  // React Strict Mode.
  const initialFetchedRef = useRef(false);
  const prevFiltersKeyRef = useRef(filtersKey);

  if (prevFiltersKeyRef.current !== filtersKey) {
    // Filters changed: synchronously prepare state before the next render
    prevFiltersKeyRef.current = filtersKey;
    initialFetchedRef.current = false;
    generationRef.current += 1;
    setMarkets([]);
    setTotal(0);
    setPage(1);
    setIsLoading(true);
    setIsFetchingMore(false);
    setError(null);
  }

  if (!initialFetchedRef.current) {
    initialFetchedRef.current = true;
    // Kick off initial fetch outside of render by scheduling a microtask
    const gen = generationRef.current;
    Promise.resolve().then(() => fetchPage(1, gen, false));
  }

  const loadMore = useCallback(() => {
    if (isFetchingMore || isLoading) return;
    const nextPage = page + 1;
    const maxPage = Math.ceil(total / limit);
    if (nextPage > maxPage) return;

    setIsFetchingMore(true);
    const gen = generationRef.current;
    fetchPage(nextPage, gen, true);
  }, [isFetchingMore, isLoading, page, total, limit, fetchPage]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    initialFetchedRef.current = false;
    setMarkets([]);
    setTotal(0);
    setPage(1);
    setIsLoading(true);
    setIsFetchingMore(false);
    setError(null);

    const gen = generationRef.current;
    Promise.resolve().then(() => fetchPage(1, gen, false));
  }, [fetchPage]);

  return {
    markets,
    total,
    isLoading,
    isFetchingMore,
    hasMore: markets.length < total || isLoading,
    loadMore,
    error,
    reset,
  };
}
