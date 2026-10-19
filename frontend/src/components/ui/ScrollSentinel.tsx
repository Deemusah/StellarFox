// ============================================================
// BANKERCHANGER — ScrollSentinel Component
// Invisible div at the bottom of a list that triggers loadMore
// via IntersectionObserver, and optionally shows a spinner or
// "no more results" message.
// ============================================================

'use client';

import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { LoadingSpinner } from './LoadingSpinner';

interface ScrollSentinelProps {
  /** Called when the sentinel scrolls into view */
  onLoadMore: () => void;
  /** Whether more items are available to fetch */
  hasMore: boolean;
  /** Whether a fetch is currently in flight */
  isLoading: boolean;
  /** Message shown when all items have been loaded */
  endMessage?: string;
  /**
   * Root margin passed to IntersectionObserver.
   * A positive bottom margin (e.g. "200px") fires the callback before the
   * sentinel is fully visible, giving a smoother loading experience.
   */
  rootMargin?: string;
}

/**
 * Place this at the bottom of any list that uses infinite scroll.
 * It renders an invisible sentinel div tracked by IntersectionObserver,
 * and shows a spinner while more data is loading.
 */
export function ScrollSentinel({
  onLoadMore,
  hasMore,
  isLoading,
  endMessage = 'All markets loaded',
  rootMargin = '0px 0px 200px 0px',
}: ScrollSentinelProps): JSX.Element {
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore,
    hasMore,
    isLoading,
    rootMargin,
  });

  return (
    <div
      ref={sentinelRef}
      aria-live="polite"
      aria-atomic="true"
      className="flex justify-center items-center py-6"
    >
      {isLoading ? (
        <LoadingSpinner size="w-8 h-8" label="Loading more markets…" />
      ) : !hasMore ? (
        <p className="text-gray-500 text-sm">{endMessage}</p>
      ) : null}
    </div>
  );
}
