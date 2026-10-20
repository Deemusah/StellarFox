/**
 * Hook for real-time market updates via WebSocket
 * Falls back to HTTP polling if WebSocket is unavailable
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Market } from '../types';
import { fetchMarketById } from '../services/api';
import { WebSocketService, type MarketUpdateEvent } from '../services/websocket';

export interface UseMarketUpdatesResult {
  market: Market | null;
  isLoading: boolean;
  error: Error | null;
  isNotFound: boolean;
  isRealtime: boolean; // true if receiving updates via WebSocket
}

interface MarketUpdateData {
  price?: number;
  odds_a?: number;
  odds_b?: number;
  odds_draw?: number;
  status?: string;
  pool_a?: number;
  pool_b?: number;
  pool_draw?: number;
  volume?: number;
  num_bets?: number;
  locked_at?: string;
  resolved_at?: string;
  outcome?: string;
  [key: string]: unknown;
}

const POLL_INTERVAL = 10_000; // 10 seconds fallback
const SHOULD_POLL_STATUSES = ['open', 'locked'] as const;

/**
 * Fetches a single market with real-time updates via WebSocket.
 * Falls back to HTTP polling every 10 seconds if WebSocket is unavailable.
 * Stops polling when status becomes 'resolved' or 'cancelled'.
 *
 * @param marketId - The market ID to subscribe to
 * @returns Market data, loading state, and connection status
 */
export function useMarketUpdates(marketId: string): UseMarketUpdatesResult {
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isRealtime, setIsRealtime] = useState(false);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsUnsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  const shouldPoll = useCallback((status?: string): boolean => {
    return SHOULD_POLL_STATUSES.includes(status as any);
  }, []);

  // Fetch initial market data
  const fetchMarketData = useCallback(async () => {
    try {
      const data = await fetchMarketById(marketId);
      if (!isMountedRef.current) return;

      setMarket(data);
      setError(null);
      setIsNotFound(false);

      return data;
    } catch (e) {
      if (!isMountedRef.current) return;
      setError(e as Error);

      if ((e as any).name === 'NotFoundError') {
        setIsNotFound(true);
      }

      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [marketId]);

  // Apply market update from WebSocket event
  const applyMarketUpdate = useCallback((event: MarketUpdateEvent) => {
    if (!isMountedRef.current) return;

    setMarket((prev) => {
      if (!prev) return prev;

      const updateData = event.data as MarketUpdateData;
      return {
        ...prev,
        ...Object.fromEntries(
          Object.entries(updateData).filter(([, v]) => v !== undefined)
        ),
        // Preserve fields that shouldn't be partial updated
        id: prev.id,
        creator_address: prev.creator_address,
      };
    });
  }, []);

  // Setup WebSocket subscription
  useEffect(() => {
    if (!marketId || !isMountedRef.current) return;

    let wsConnected = false;
    let hasWSError = false;

    const setupWebSocket = async () => {
      try {
        const wsService = WebSocketService.getInstance();

        // Check if we have an auth token
        // This is a simplified approach; in production you'd get the token from auth context
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
          : null;

        if (token) {
          try {
            await wsService.setToken(token);
            wsConnected = true;
            setIsRealtime(true);

            // Subscribe to market updates
            wsUnsubscribeRef.current = wsService.subscribe(marketId, applyMarketUpdate);
          } catch (wsError) {
            hasWSError = true;
            setIsRealtime(false);
            console.debug('WebSocket connection failed, falling back to polling', wsError);
          }
        } else {
          setIsRealtime(false);
        }
      } catch (e) {
        hasWSError = true;
        setIsRealtime(false);
        console.debug('WebSocket setup failed, falling back to polling', e);
      }
    };

    // Fetch initial data and setup WebSocket
    fetchMarketData().then((data) => {
      setupWebSocket().catch(() => {
        // Already logged in setupWebSocket
      });

      // Setup polling as fallback or when WebSocket is not available
      if (data && shouldPoll(data.status)) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

        pollingIntervalRef.current = setInterval(async () => {
          if (!isMountedRef.current) return;

          try {
            const updated = await fetchMarketById(marketId);
            if (!isMountedRef.current) return;

            setMarket(updated);

            // Stop polling if status changed
            if (!shouldPoll(updated.status)) {
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
            }
          } catch (e) {
            if (isMountedRef.current) {
              setError(e as Error);
            }
          }
        }, POLL_INTERVAL);
      }
    });

    return () => {
      // Unsubscribe from WebSocket
      if (wsUnsubscribeRef.current) {
        wsUnsubscribeRef.current();
        wsUnsubscribeRef.current = null;
      }

      // Clear polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [marketId, fetchMarketData, shouldPoll, applyMarketUpdate]);

  // Refresh when a claim succeeds for this market
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.marketId === marketId) {
        setMarket(null);
        setIsLoading(true);
        fetchMarketData();
      }
    };

    window.addEventListener('bankerchanger:claim_success', handler);
    return () => window.removeEventListener('bankerchanger:claim_success', handler);
  }, [marketId, fetchMarketData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { market, isLoading, error, isNotFound, isRealtime };
}

export default useMarketUpdates;
