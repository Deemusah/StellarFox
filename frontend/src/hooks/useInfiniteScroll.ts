// ============================================================
// BANKERCHANGER — useInfiniteScroll Hook
// Attaches an IntersectionObserver to a sentinel element and
// calls `onLoadMore` whenever the sentinel enters the viewport.
// ============================================================

import { useEffect, useRef, useCallback } from 'react';

export interface UseInfiniteScrollOptions {
  /** Called when the sentinel element scrolls into view */
  onLoadMore: () => void;
  /** Whether there is more data to load (stops observing when false) */
  hasMore: boolean;
  /** Whether a fetch is currently in flight (prevents duplicate calls) */
  isLoading: boolean;
  /** Intersection threshold 0–1 (default: 0) */
  threshold?: number;
  /**
   * Root margin passed to IntersectionObserver, e.g. "0px 0px 200px 0px"
   * to trigger slightly before the sentinel is fully visible (default: "0px").
   */
  rootMargin?: string;
}

export interface UseInfiniteScrollResult {
  /** Attach this ref to the sentinel / bottom-of-list element */
  sentinelRef: React.RefObject<HTMLDivElement>;
}

/**
 * Observes a sentinel element at the bottom of a list.
 * When the sentinel enters the viewport and there is more data to load,
 * `onLoadMore` is called.  The observer is detached while `isLoading` is
 * true to prevent duplicate requests.
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0,
  rootMargin = '0px',
}: UseInfiniteScrollOptions): UseInfiniteScrollResult {
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Keep a stable reference to the callback so the observer never needs
  // to be recreated when the caller's function identity changes.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const observe = useCallback(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, threshold, rootMargin]);

  useEffect(() => {
    const cleanup = observe();
    return cleanup;
  }, [observe]);

  return { sentinelRef };
}
