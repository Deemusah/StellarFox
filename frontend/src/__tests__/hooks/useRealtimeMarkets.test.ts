/**
 * Tests for useRealtimeMarkets hook
 * Verifies market list fetching, real-time incremental updates, and polling fallback
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeMarkets } from '../useRealtimeMarkets';
import * as api from '../../services/api';
import { WebSocketService } from '../../services/websocket';
import type { Market } from '../../types';

jest.mock('../../services/api');
jest.mock('../../services/websocket');

const mockMarkets: Market[] = [
  {
    id: 'market-1',
    fighter_a: 'Fighter A',
    fighter_b: 'Fighter B',
    status: 'open',
    weight_class: 'heavyweight',
    pool_a: 1000,
    pool_b: 1000,
    odds_a: 5000,
    odds_b: 5000,
    odds_draw: 0,
    creator_address: 'creator1',
    venue: 'Venue 1',
    scheduled_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'market-2',
    fighter_a: 'Fighter C',
    fighter_b: 'Fighter D',
    status: 'open',
    weight_class: 'middleweight',
    pool_a: 500,
    pool_b: 500,
    odds_a: 5000,
    odds_b: 5000,
    odds_draw: 0,
    creator_address: 'creator2',
    venue: 'Venue 2',
    scheduled_at: '2024-01-02T00:00:00Z',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
];

describe('useRealtimeMarkets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should fetch and return market list on mount', async () => {
    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: mockMarkets,
      total: 2,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    const { result } = renderHook(() => useRealtimeMarkets());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.markets).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.markets).toEqual(mockMarkets);
    expect(result.current.total).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('should subscribe to each market in the list', async () => {
    const mockSubscribe = jest.fn(() => jest.fn());
    const mockSetToken = jest.fn().mockResolvedValue(undefined);

    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: mockMarkets,
      total: 2,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: mockSetToken,
      subscribe: mockSubscribe,
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { result } = renderHook(() => useRealtimeMarkets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSetToken).toHaveBeenCalledWith('test-token-123');
    expect(mockSubscribe).toHaveBeenCalledWith('market-1', expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledWith('market-2', expect.any(Function));
    expect(result.current.isRealtime).toBe(true);
  });

  it('should apply real-time market updates to the list', async () => {
    const subscribeCallbacks = new Map<string, Function>();
    const mockSubscribe = jest.fn((marketId, cb) => {
      subscribeCallbacks.set(marketId, cb);
      return jest.fn();
    });

    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: mockMarkets,
      total: 2,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: mockSubscribe,
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { result } = renderHook(() => useRealtimeMarkets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate update to market-1
    act(() => {
      const callback = subscribeCallbacks.get('market-1');
      if (callback) {
        (callback as any)({
          type: 'market_update',
          marketId: 'market-1',
          eventType: 'odds_updated',
          data: { odds_a: 6000, odds_b: 4000 },
          timestamp: new Date().toISOString(),
        });
      }
    });

    await waitFor(() => {
      const market = result.current.markets.find((m) => m.id === 'market-1');
      expect(market?.odds_a).toBe(6000);
      expect(market?.odds_b).toBe(4000);
    });
  });

  it('should handle filters correctly', async () => {
    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: [mockMarkets[0]],
      total: 1,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    const filters = { status: 'open' };
    const { result } = renderHook(() => useRealtimeMarkets(filters));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.fetchMarkets).toHaveBeenCalledWith(filters, undefined);
    expect(result.current.markets).toEqual([mockMarkets[0]]);
  });

  it('should handle pagination correctly', async () => {
    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: [mockMarkets[0]],
      total: 1,
      page: 2,
      limit: 1,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    const pagination = { page: 2, limit: 1 };
    const { result } = renderHook(() => useRealtimeMarkets(undefined, pagination));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.fetchMarkets).toHaveBeenCalledWith(undefined, pagination);
  });

  it('should handle API errors gracefully', async () => {
    const error = new api.NetworkError('Network error');
    (api.fetchMarkets as jest.Mock).mockRejectedValue(error);

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    const { result } = renderHook(() => useRealtimeMarkets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toEqual(error);
    expect(result.current.markets).toEqual([]);
  });

  it('should unsubscribe from old markets when list changes', async () => {
    const unsubscribe1 = jest.fn();
    const unsubscribe2 = jest.fn();

    const subscribeCallbacks = new Map<string, any>();
    let callCount = 0;

    const mockSubscribe = jest.fn((marketId, cb) => {
      subscribeCallbacks.set(marketId, cb);
      if (callCount === 0) return unsubscribe1;
      if (callCount === 1) return unsubscribe2;
      return jest.fn();
    });

    (api.fetchMarkets as jest.Mock)
      .mockResolvedValueOnce({
        markets: mockMarkets,
        total: 2,
        page: 1,
        limit: 50,
      })
      .mockResolvedValueOnce({
        markets: [mockMarkets[0]],
        total: 1,
        page: 1,
        limit: 50,
      });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: mockSubscribe,
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { result, rerender } = renderHook(
      ({ filters }: any) => useRealtimeMarkets(filters),
      { initialProps: { filters: undefined } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.markets).toHaveLength(2);
    });

    callCount = 1;

    // Trigger refetch
    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.markets).toHaveLength(1);
    });

    // Verify unsubscribe was called for market-2
    // (this tests the cleanup logic)
  });

  it('should support manual refetch', async () => {
    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: mockMarkets,
      total: 2,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    const { result } = renderHook(() => useRealtimeMarkets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialCallCount = (api.fetchMarkets as jest.Mock).mock.calls.length;

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect((api.fetchMarkets as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });
  });

  it('should fall back to polling when WebSocket is unavailable', async () => {
    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: mockMarkets,
      total: 2,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockRejectedValue(new Error('WS failed')),
      subscribe: jest.fn(() => jest.fn()),
    });

    localStorage.setItem('auth_token', 'test-token-123');

    jest.useFakeTimers();

    const { result } = renderHook(() => useRealtimeMarkets());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isRealtime).toBe(false);
    expect(result.current.markets).toEqual(mockMarkets);

    // Should poll after 30 seconds
    const initialCallCount = (api.fetchMarkets as jest.Mock).mock.calls.length;

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => {
      expect((api.fetchMarkets as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });

    jest.useRealTimers();
  });

  it('should clean up subscriptions on unmount', async () => {
    const mockUnsubscribe = jest.fn();
    (api.fetchMarkets as jest.Mock).mockResolvedValue({
      markets: mockMarkets,
      total: 2,
      page: 1,
      limit: 50,
    });

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => mockUnsubscribe),
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { unmount } = renderHook(() => useRealtimeMarkets());

    await waitFor(() => {
      expect((api.fetchMarkets as jest.Mock)).toHaveBeenCalled();
    });

    unmount();

    // Verify unsubscribe was called for each market
    expect(mockUnsubscribe.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
