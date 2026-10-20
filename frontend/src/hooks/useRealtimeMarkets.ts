/**
 * Hook for real-time market list with incremental updates via WebSocket
 * Maintains local market list and updates individual markets as WebSocket events arrive
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Market } from '../types';
import type { MarketFilters, PaginationParams } from '../services/api';
import { fetchMarkets } from '../services/api';
import { WebSocketService, type MarketUpdateEvent } from '../services/websocket';

export interface UseRealtimeMarketsResult {
  markets: Market[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  isRealtime: boolean; // true if receiving updates via WebSocket
  refetch: () => void;
}

const POLL_INTERVAL = 30_000; // 30 seconds fallback

/**
 * Fetches and maintains a real-time market list with incremental updates via WebSocket.
 * 
 * Starts with an initial HTTP fetch, then subscribes to WebSocket updates for each market.
 * When a market update event arrives, updates that market in the local list.
 * Falls back to polling every 30 seconds if WebSocket is unavailable.
 * 
 * @param filters - Optional market filters
 * @param pagination - Optional pagination parameters
 * @returns Market list, loading state, and connection status
 */
export function useRealtimeMarkets(
  filters?: MarketFilters,
  pagination?: PaginationParams,
): UseRealtimeMarketsResult {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRealtime, setIsRealtime] = useState(false);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsUnsubscribesRef = useRef<Map<string, () => void>>(new Map());
  const isMountedRef = useRef(true);
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const currentMarketsRef = useRef<Market[]>([]);

  // Serialize filters and pagination for effect dependency
  const filtersKey = JSON.stringify(filters ?? null);
  const paginationKey = JSON.stringify(pagination ?? null);

  // Fetch market list
  const fetchMarketList = useCallback(async () => {
    try {
      const filtersObj = filtersKey !== 'null' ? (JSON.parse(filtersKey) as MarketFilters) : undefined;
      const paginationObj = paginationKey !== 'null' ? (JSON.parse(paginationKey) as PaginationParams) : undefined;

      const response = await fetchMarkets(filtersObj, paginationObj);

      if (!isMountedRef.current) return;

      setMarkets(response.markets);
      currentMarketsRef.current = response.markets;
      setTotal(response.total);
      setError(null);

      return response.markets;
    } catch (e) {
      if (isMountedRef.current) {
        setError(e as Error);
      }
      return null;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [filtersKey, paginationKey]);

  // Apply a single market update to the local list
  const applyMarketUpdate = useCallback((event: MarketUpdateEvent) => {
    if (!isMountedRef.current) return;

    setMarkets((prev) => {
      const updated = [...prev];
      const index = updated.findIndex((m) => m.id === event.marketId);

      if (index !== -1) {
        const updateData = event.data as Record<string, unknown>;
        updated[index] = {
          ...updated[index],
          ...Object.fromEntries(
            Object.entries(updateData).filter(([, v]) => v !== undefined)
          ),
        };
      }

      return updated;
    });
  }, []);

  // Setup WebSocket subscriptions for all markets
  const setupWebSocketSubscriptions = useCallback(async (marketList: Market[]) => {
    try {
      const wsService = WebSocketService.getInstance();
      wsServiceRef.current = wsService;

      // Check if we have an auth token
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
        : null;

      if (!token) {
        setIsRealtime(false);
        return;
      }

      try {
        await wsService.setToken(token);

        // Subscribe to each market
        for (const market of marketList) {
          // Clean up existing subscription if any
          const existing = wsUnsubscribesRef.current.get(market.id);
          if (existing) existing();

          // Subscribe to this market
          const unsubscribe = wsService.subscribe(market.id, applyMarketUpdate);
          wsUnsubscribesRef.current.set(market.id, unsubscribe);
        }

        // Unsubscribe from markets no longer in the list
        for (const [marketId, unsubscribe] of wsUnsubscribesRef.current.entries()) {
          if (!marketList.some((m) => m.id === marketId)) {
            unsubscribe();
            wsUnsubscribesRef.current.delete(marketId);
          }
        }

        setIsRealtime(true);
      } catch (wsError) {
        setIsRealtime(false);
        console.debug('WebSocket subscription setup failed', wsError);
      }
    } catch (e) {
      setIsRealtime(false);
      console.debug('WebSocket setup failed', e);
    }
  }, [applyMarketUpdate]);

  // Main effect: fetch markets and setup WebSocket
  useEffect(() => {
    fetchMarketList().then((marketList) => {
      if (marketList && marketList.length > 0) {
        setupWebSocketSubscriptions(marketList).catch(() => {
          // Already logged in setupWebSocketSubscriptions
        });
      }

      // Setup polling as fallback
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

      pollingIntervalRef.current = setInterval(() => {
        if (!isMountedRef.current) return;
        fetchMarketList().catch(() => {
          // Error already handled in fetchMarketList
        });
      }, POLL_INTERVAL);
    });

    return () => {
      // Cleanup WebSocket subscriptions
      for (const unsubscribe of wsUnsubscribesRef.current.values()) {
        unsubscribe();
      }
      wsUnsubscribesRef.current.clear();

      // Clear polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [filtersKey, paginationKey, fetchMarketList, setupWebSocketSubscriptions]);

  // Manual refetch
  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchMarketList().then((marketList) => {
      if (marketList && marketList.length > 0) {
        setupWebSocketSubscriptions(marketList).catch(() => {
          // Already logged
        });
      }
    });
  }, [fetchMarketList, setupWebSocketSubscriptions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { markets, total, isLoading, error, isRealtime, refetch };
}

export default useRealtimeMarkets;
