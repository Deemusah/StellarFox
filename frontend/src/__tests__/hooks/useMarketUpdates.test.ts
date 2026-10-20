/**
 * Tests for useMarketUpdates hook
 * Verifies WebSocket subscription, polling fallback, and real-time updates
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMarketUpdates } from '../useMarketUpdates';
import * as api from '../../services/api';
import { WebSocketService } from '../../services/websocket';
import type { Market } from '../../types';

// Mock the API module
jest.mock('../../services/api');
jest.mock('../../services/websocket');

const mockMarket: Market = {
  id: 'market-123',
  fighter_a: 'Fighter A',
  fighter_b: 'Fighter B',
  status: 'open',
  weight_class: 'heavyweight',
  pool_a: 1000,
  pool_b: 1000,
  odds_a: 5000,
  odds_b: 5000,
  odds_draw: 0,
  creator_address: 'creator123',
  venue: 'Venue',
  scheduled_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('useMarketUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should fetch and return market data on mount', async () => {
    (api.fetchMarketById as jest.Mock).mockResolvedValue(mockMarket);
    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
      getState: () => 'authenticated',
    });

    const { result } = renderHook(() => useMarketUpdates('market-123'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.market).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.market).toEqual(mockMarket);
    expect(result.current.error).toBeNull();
    expect(api.fetchMarketById).toHaveBeenCalledWith('market-123');
  });

  it('should handle NotFoundError correctly', async () => {
    const notFoundError = new api.NotFoundError('Market not found');
    (api.fetchMarketById as jest.Mock).mockRejectedValue(notFoundError);

    const { result } = renderHook(() => useMarketUpdates('nonexistent'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isNotFound).toBe(true);
    expect(result.current.error).toEqual(notFoundError);
  });

  it('should subscribe to WebSocket updates when market is open', async () => {
    const mockSubscribe = jest.fn(() => jest.fn());
    const mockSetToken = jest.fn().mockResolvedValue(undefined);

    (api.fetchMarketById as jest.Mock).mockResolvedValue(mockMarket);
    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: mockSetToken,
      subscribe: mockSubscribe,
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { result } = renderHook(() => useMarketUpdates('market-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockSetToken).toHaveBeenCalledWith('test-token-123');
    expect(mockSubscribe).toHaveBeenCalledWith('market-123', expect.any(Function));
    expect(result.current.isRealtime).toBe(true);
  });

  it('should handle WebSocket subscription errors and fall back to polling', async () => {
    const mockSetToken = jest.fn().mockRejectedValue(new Error('WS Error'));
    (api.fetchMarketById as jest.Mock).mockResolvedValue(mockMarket);
    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: mockSetToken,
      subscribe: jest.fn(),
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { result } = renderHook(() => useMarketUpdates('market-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should still have market data and should not be in real-time mode
    expect(result.current.market).toEqual(mockMarket);
    expect(result.current.isRealtime).toBe(false);
  });

  it('should apply WebSocket market updates correctly', async () => {
    let subscribeCallback: any;
    const mockSubscribe = jest.fn((marketId, cb) => {
      subscribeCallback = cb;
      return jest.fn();
    });

    (api.fetchMarketById as jest.Mock).mockResolvedValue(mockMarket);
    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: mockSubscribe,
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { result } = renderHook(() => useMarketUpdates('market-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate WebSocket update
    act(() => {
      subscribeCallback({
        type: 'market_update',
        marketId: 'market-123',
        eventType: 'status_changed',
        data: { new_status: 'locked' },
        timestamp: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(result.current.market?.status).toBe('locked');
    });
  });

  it('should stop polling when market status is resolved', async () => {
    const resolvedMarket = { ...mockMarket, status: 'resolved' };
    (api.fetchMarketById as jest.Mock)
      .mockResolvedValueOnce(mockMarket)
      .mockResolvedValueOnce(resolvedMarket);

    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    jest.useFakeTimers();

    const { result } = renderHook(() => useMarketUpdates('market-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.market?.status).toBe('open');

    // Advance polling interval
    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    await waitFor(() => {
      expect(result.current.market?.status).toBe('resolved');
    });

    // Advance again — should not fetch because polling should have stopped
    const fetchCount = (api.fetchMarketById as jest.Mock).mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect((api.fetchMarketById as jest.Mock).mock.calls.length).toBe(fetchCount);

    jest.useRealTimers();
  });

  it('should unsubscribe from WebSocket on unmount', async () => {
    const mockUnsubscribe = jest.fn();
    (api.fetchMarketById as jest.Mock).mockResolvedValue(mockMarket);
    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => mockUnsubscribe),
    });

    localStorage.setItem('auth_token', 'test-token-123');

    const { unmount } = renderHook(() => useMarketUpdates('market-123'));

    await waitFor(() => {
      expect((api.fetchMarketById as jest.Mock)).toHaveBeenCalled();
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should handle claim success event', async () => {
    (api.fetchMarketById as jest.Mock).mockResolvedValue(mockMarket);
    (WebSocketService.getInstance as jest.Mock).mockReturnValue({
      setToken: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(() => jest.fn()),
    });

    const { result } = renderHook(() => useMarketUpdates('market-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.market).toEqual(mockMarket);

    // Simulate claim success event
    act(() => {
      const event = new CustomEvent('bankerchanger:claim_success', {
        detail: { marketId: 'market-123' },
      });
      window.dispatchEvent(event);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect((api.fetchMarketById as jest.Mock).mock.calls.length).toBeGreaterThan(1);
    });
  });
});
