/**
 * Unit tests for useMarketAutocomplete hook.
 *
 * Covers:
 * - Initial state
 * - Debouncing (suggestions only fire after 300 ms)
 * - Successful suggestion fetch
 * - Query shorter than minimum length skips fetch
 * - Error state
 * - clearSuggestions()
 * - Suggestions update as query changes
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useMarketAutocomplete } from '../../hooks/useMarketAutocomplete';
import { server } from '../mocks/handlers';

describe('useMarketAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Initial state ────────────────────────────────────────────────────────

  describe('Initial state', () => {
    it('starts with empty suggestions', () => {
      const { result } = renderHook(() => useMarketAutocomplete(''));
      expect(result.current.suggestions).toEqual([]);
    });

    it('starts with isLoading = false', () => {
      const { result } = renderHook(() => useMarketAutocomplete(''));
      expect(result.current.isLoading).toBe(false);
    });

    it('starts with null error', () => {
      const { result } = renderHook(() => useMarketAutocomplete(''));
      expect(result.current.error).toBeNull();
    });
  });

  // ── Skip fetch for empty/short query ────────────────────────────────────

  describe('Short or empty query', () => {
    it('does not fetch when query is empty', async () => {
      let callCount = 0;
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () => {
          callCount++;
          return HttpResponse.json({ suggestions: [] });
        }),
      );

      renderHook(() => useMarketAutocomplete(''));
      act(() => { jest.advanceTimersByTime(400); });

      expect(callCount).toBe(0);
    });

    it('does not fetch when query is only whitespace', async () => {
      let callCount = 0;
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () => {
          callCount++;
          return HttpResponse.json({ suggestions: [] });
        }),
      );

      renderHook(() => useMarketAutocomplete('   '));
      act(() => { jest.advanceTimersByTime(400); });

      expect(callCount).toBe(0);
    });
  });

  // ── Debouncing ───────────────────────────────────────────────────────────

  describe('Debouncing', () => {
    it('does not fetch before debounce delay', () => {
      let callCount = 0;
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () => {
          callCount++;
          return HttpResponse.json({ suggestions: [] });
        }),
      );

      renderHook(() => useMarketAutocomplete('Fight'));
      // Only 200ms — debounce hasn't fired yet
      act(() => { jest.advanceTimersByTime(200); });

      expect(callCount).toBe(0);
    });

    it('fetches after the debounce delay', async () => {
      let callCount = 0;
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () => {
          callCount++;
          return HttpResponse.json({ suggestions: [] });
        }),
      );

      renderHook(() => useMarketAutocomplete('Fight'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(callCount).toBe(1));
    });

    it('only fires one request when query changes rapidly', async () => {
      let callCount = 0;
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () => {
          callCount++;
          return HttpResponse.json({ suggestions: [] });
        }),
      );

      const { rerender } = renderHook(
        ({ query }: { query: string }) => useMarketAutocomplete(query),
        { initialProps: { query: 'F' } },
      );

      act(() => { jest.advanceTimersByTime(100); });
      rerender({ query: 'Fi' });
      act(() => { jest.advanceTimersByTime(100); });
      rerender({ query: 'Fig' });
      act(() => { jest.advanceTimersByTime(100); });
      rerender({ query: 'Figh' });

      // Advance past the debounce — only 1 request should have fired
      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(callCount).toBe(1));
    });
  });

  // ── Successful suggestions ───────────────────────────────────────────────

  describe('Suggestions populated after successful fetch', () => {
    it('populates suggestions matching the query', async () => {
      const { result } = renderHook(() => useMarketAutocomplete('Fighter'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // mockMarkets has Fighter A, Fighter B, Fighter C, Fighter D — all match "Fighter"
      expect(result.current.suggestions.length).toBeGreaterThan(0);
      result.current.suggestions.forEach((s) => {
        expect(s.name.toLowerCase()).toContain('fighter');
      });
    });

    it('each suggestion has name, market_id, and side fields', async () => {
      const { result } = renderHook(() => useMarketAutocomplete('Fighter'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => result.current.suggestions.length > 0);

      const s = result.current.suggestions[0];
      expect(s).toHaveProperty('name');
      expect(s).toHaveProperty('market_id');
      expect(s).toHaveProperty('side');
      expect(['a', 'b']).toContain(s.side);
    });

    it('sets isLoading = false after fetch completes', async () => {
      const { result } = renderHook(() => useMarketAutocomplete('Fight'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });

    it('clears error on successful fetch', async () => {
      // First make the server fail
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () =>
          HttpResponse.json({ error: 'fail' }, { status: 500 }),
        ),
      );

      const { result, rerender } = renderHook(
        ({ query }: { query: string }) => useMarketAutocomplete(query),
        { initialProps: { query: 'Err' } },
      );

      act(() => { jest.advanceTimersByTime(300); });
      await waitFor(() => expect(result.current.error).not.toBeNull());

      // Now restore the default handler and change the query
      server.resetHandlers();
      rerender({ query: 'Fighter' });
      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(result.current.error).toBeNull());
    });
  });

  // ── Suggestions update as user types ────────────────────────────────────

  describe('Suggestions update as user types', () => {
    it('returns different suggestions for different queries', async () => {
      const { result, rerender } = renderHook(
        ({ query }: { query: string }) => useMarketAutocomplete(query),
        { initialProps: { query: 'Fighter A' } },
      );

      act(() => { jest.advanceTimersByTime(300); });
      await waitFor(() => result.current.suggestions.length > 0);
      const firstSuggestions = [...result.current.suggestions];

      rerender({ query: 'Fighter D' });
      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => {
        const names = result.current.suggestions.map((s) => s.name);
        return names.some((n) => n.includes('D'));
      });

      // The list should have changed
      expect(result.current.suggestions).not.toEqual(firstSuggestions);
    });

    it('clears suggestions when query is cleared', async () => {
      const { result, rerender } = renderHook(
        ({ query }: { query: string }) => useMarketAutocomplete(query),
        { initialProps: { query: 'Fighter' } },
      );

      act(() => { jest.advanceTimersByTime(300); });
      await waitFor(() => result.current.suggestions.length > 0);

      rerender({ query: '' });
      act(() => { jest.advanceTimersByTime(300); });

      // Short-circuit clears immediately (no debounce needed for empty)
      expect(result.current.suggestions).toEqual([]);
    });
  });

  // ── Error state ──────────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('sets error on API failure', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () =>
          HttpResponse.json({ error: 'Server Error' }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useMarketAutocomplete('Crash'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.suggestions).toEqual([]);
    });

    it('sets isLoading = false on error', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () =>
          HttpResponse.json({ error: 'fail' }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useMarketAutocomplete('Crash'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  // ── clearSuggestions ─────────────────────────────────────────────────────

  describe('clearSuggestions()', () => {
    it('clears suggestions when called', async () => {
      const { result } = renderHook(() => useMarketAutocomplete('Fighter'));

      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => result.current.suggestions.length > 0);

      act(() => { result.current.clearSuggestions(); });

      expect(result.current.suggestions).toEqual([]);
    });

    it('clears error when called', async () => {
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', () =>
          HttpResponse.json({ error: 'fail' }, { status: 500 }),
        ),
      );

      const { result } = renderHook(() => useMarketAutocomplete('Err'));

      act(() => { jest.advanceTimersByTime(300); });
      await waitFor(() => expect(result.current.error).not.toBeNull());

      act(() => { result.current.clearSuggestions(); });

      expect(result.current.error).toBeNull();
    });
  });

  // ── Respects limit parameter ─────────────────────────────────────────────

  describe('limit parameter', () => {
    it('passes limit to the API', async () => {
      let capturedUrl = '';
      server.use(
        http.get('http://localhost:3001/api/markets/search/suggestions', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({ suggestions: [] });
        }),
      );

      renderHook(() => useMarketAutocomplete('Fight', 3));
      act(() => { jest.advanceTimersByTime(300); });

      await waitFor(() => capturedUrl !== '');

      expect(new URL(capturedUrl).searchParams.get('limit')).toBe('3');
    });
  });
});
