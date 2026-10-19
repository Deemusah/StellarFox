/**
 * Unit tests for useInfiniteMarkets hook.
 *
 * Uses MSW (via the shared server in src/__tests__/mocks/handlers.ts) to
 * intercept HTTP calls made by fetchMarkets.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useInfiniteMarkets } from '../../hooks/useInfiniteMarkets';
import { server, mockMarkets } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useInfiniteMarkets', () => {
  describe('Initial loading state', () => {
    it('should start with isLoading = true', () => {
      const { result } = renderHook(() => useInfiniteMarkets());
      expect(result.current.isLoading).toBe(true);
    });

    it('should start with empty markets array', () => {
      const { result } = renderHook(() => useInfiniteMarkets());
      expect(result.current.markets).toEqual([]);
    });

    it('should start with null error', () => {
      const { result } = renderHook(() => useInfiniteMarkets());
      expect(result.current.error).toBeNull();
    });

    it('should start with hasMore = true while loading', () => {
      const { result } = renderHook(() => useInfiniteMarkets());
      // hasMore is true initially because isLoading is true
      expect(result.current.hasMore).toBe(true);
    });

    it('should start with isFetchingMore = false', () => {
      const { result } = renderHook(() => useInfiniteMarkets());
      expect(result.current.isFetchingMore).toBe(false);
    });
  });

  describe('Markets populated after initial fetch', () => {
    it('should populate markets after initial fetch succeeds', async () => {
      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.markets.length).toBeGreaterThan(0);
      expect(result.current.markets[0].market_id).toBe('market-1');
    });

    it('should set total to the count returned by the API', async () => {
      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.total).toBe(mockMarkets.length);
    });

    it('should set isLoading = false after successful fetch', async () => {
      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should clear error after successful fetch', async () => {
      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it('should set hasMore = false when all items are loaded', async () => {
      // All mockMarkets fit on one page (< LIMIT), so hasMore should be false
      const { result } = renderHook(() => useInfiniteMarkets(undefined, 20));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should set error on network failure', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets', () =>
          HttpResponse.json({ error: 'Server Error' }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toContain('Unexpected response');
    });

    it('should set isLoading = false even on error', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets', () =>
          HttpResponse.json({ error: 'Server Error' }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('loadMore appends items', () => {
    it('should expose loadMore function', async () => {
      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.loadMore).toBe('function');
    });

    it('should append markets when loadMore is called', async () => {
      // Serve a paginated dataset with 2 items per page
      const page1 = [mockMarkets[0]];
      const page2 = [mockMarkets[1]];

      server.use(
        http.get('http://localhost:3001/api/markets', ({ request }) => {
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get('page') ?? '1');
          const data = page === 1 ? page1 : page2;
          return HttpResponse.json({ markets: data, total: 2, page, limit: 1 });
        }),
      );

      const { result } = renderHook(() => useInfiniteMarkets(undefined, 1));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.markets).toHaveLength(1);
      expect(result.current.hasMore).toBe(true);

      // Load the second page
      act(() => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.markets).toHaveLength(2);
      });

      expect(result.current.markets[0].market_id).toBe('market-1');
      expect(result.current.markets[1].market_id).toBe('market-2');
    });

    it('should set isFetchingMore = true while fetching the next page', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets', ({ request }) => {
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get('page') ?? '1');
          return HttpResponse.json({
            markets: page === 1 ? [mockMarkets[0]] : [mockMarkets[1]],
            total: 2,
            page,
            limit: 1,
          });
        }),
      );

      const { result } = renderHook(() => useInfiniteMarkets(undefined, 1));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.loadMore();
      });

      // isFetchingMore should be set while the request is in flight
      expect(result.current.isFetchingMore).toBe(true);

      await waitFor(() => {
        expect(result.current.isFetchingMore).toBe(false);
      });
    });

    it('should NOT call loadMore when already loading', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets', ({ request }) => {
          callCount++;
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get('page') ?? '1');
          return HttpResponse.json({
            markets: page === 1 ? [mockMarkets[0]] : [mockMarkets[1]],
            total: 2,
            page,
            limit: 1,
          });
        }),
      );

      const { result } = renderHook(() => useInfiniteMarkets(undefined, 1));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const beforeLoadMore = callCount;

      // Trigger loadMore twice in a row — only one request should fire
      act(() => {
        result.current.loadMore();
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.isFetchingMore).toBe(false);
      });

      // Only one extra call should have been made
      expect(callCount).toBe(beforeLoadMore + 1);
    });

    it('should NOT call loadMore past the last page', async () => {
      let callCount = 0;

      server.use(
        http.get('http://localhost:3001/api/markets', () => {
          callCount++;
          return HttpResponse.json({
            markets: mockMarkets,
            total: mockMarkets.length,
            page: 1,
            limit: 20,
          });
        }),
      );

      const { result } = renderHook(() => useInfiniteMarkets(undefined, 20));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const beforeExtra = callCount;

      act(() => {
        result.current.loadMore();
      });

      // No additional request should fire because hasMore is false
      await new Promise((r) => setTimeout(r, 50));
      expect(callCount).toBe(beforeExtra);
    });
  });

  describe('reset() restarts from page 1', () => {
    it('should expose reset function', async () => {
      const { result } = renderHook(() => useInfiniteMarkets());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.reset).toBe('function');
    });

    it('should clear markets and re-fetch from page 1 after reset', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets', ({ request }) => {
          const url = new URL(request.url);
          const page = parseInt(url.searchParams.get('page') ?? '1');
          return HttpResponse.json({
            markets: page === 1 ? [mockMarkets[0]] : [mockMarkets[1]],
            total: 2,
            page,
            limit: 1,
          });
        }),
      );

      const { result } = renderHook(() => useInfiniteMarkets(undefined, 1));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Load page 2
      act(() => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.markets).toHaveLength(2);
      });

      // Reset
      act(() => {
        result.current.reset();
      });

      // Should go back to loading state and then only page 1
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.markets).toHaveLength(1);
      expect(result.current.markets[0].market_id).toBe('market-1');
    });
  });

  describe('Filter changes reset and re-fetch', () => {
    it('should fetch with new filters when filters change', async () => {
      const { result, rerender } = renderHook(
        ({ status }: { status?: string }) => useInfiniteMarkets({ status }),
        { initialProps: { status: undefined } },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const allCount = result.current.markets.length;

      // Switch to 'resolved' only
      rerender({ status: 'resolved' });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.markets.length).toBeLessThanOrEqual(allCount);
      result.current.markets.forEach((m) => {
        expect(m.status).toBe('resolved');
      });
    });
  });
});
