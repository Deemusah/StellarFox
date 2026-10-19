// ============================================================
// BANKERCHANGER — useMarketAutocomplete Hook
// Fetches fighter name suggestions with debouncing.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MarketSuggestion } from '../services/api';
import { fetchMarketSuggestions } from '../services/api';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 1;

export interface UseMarketAutocompleteResult {
  /** Suggestions returned from the API */
  suggestions: MarketSuggestion[];
  /** True while a request is in-flight */
  isLoading: boolean;
  /** Set when the latest fetch failed */
  error: Error | null;
  /** Clear suggestions (e.g. on blur or selection) */
  clearSuggestions: () => void;
}

/**
 * Fetches fighter name autocomplete suggestions debounced at 300 ms.
 *
 * Pass the raw input value; the hook trims it and skips the API call
 * when the trimmed query is shorter than MIN_QUERY_LENGTH characters
 * or equals the previously committed search term (via `committedQuery`).
 *
 * @param query       The current text-input value.
 * @param limit       Maximum suggestions to request (default 8).
 */
export function useMarketAutocomplete(
  query: string,
  limit = 8,
): UseMarketAutocompleteResult {
  const [suggestions, setSuggestions] = useState<MarketSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Abort controller ref so we can cancel an in-flight request when a new
  // keystroke arrives before the previous one resolves.
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    // Clear suggestions and stop if query is too short
    if (trimmed.length < MIN_QUERY_LENGTH) {
      clearSuggestions();
      setIsLoading(false);
      return;
    }

    // Debounce: reset the timer on every keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      // Cancel any pending in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchMarketSuggestions(trimmed, limit);
        setSuggestions(result.suggestions);
      } catch (e) {
        // Ignore aborted requests — they're replaced by newer ones
        if ((e as Error).name === 'AbortError') return;
        setError(e as Error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, limit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { suggestions, isLoading, error, clearSuggestions };
}
