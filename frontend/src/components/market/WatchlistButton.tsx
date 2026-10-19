'use client';

// ============================================================
// BANKERCHANGER — WatchlistButton Component
// Toggle button that adds / removes a market from the
// authenticated user's watchlist.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { addToWatchlist, removeFromWatchlist, checkWatchlistStatus } from '../../services/api';

interface WatchlistButtonProps {
  marketId: string;
  /** JWT access token — button is disabled when absent */
  token?: string;
  className?: string;
}

export function WatchlistButton({
  marketId,
  token,
  className = '',
}: WatchlistButtonProps): JSX.Element {
  const [watchlisted, setWatchlisted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check initial status when token/marketId become available
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    checkWatchlistStatus(marketId, token)
      .then((status) => {
        if (!cancelled) setWatchlisted(status);
      })
      .catch(() => {
        /* silently ignore status check failures */
      });
    return () => {
      cancelled = true;
    };
  }, [marketId, token]);

  const handleToggle = useCallback(async () => {
    if (!token || loading) return;
    setLoading(true);
    try {
      if (watchlisted) {
        await removeFromWatchlist(marketId, token);
        setWatchlisted(false);
      } else {
        await addToWatchlist(marketId, token);
        setWatchlisted(true);
      }
    } catch {
      /* leave state unchanged — caller can render a toast */
    } finally {
      setLoading(false);
    }
  }, [marketId, token, watchlisted, loading]);

  const isDisabled = !token || loading;

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isDisabled}
      aria-label={watchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
      aria-pressed={watchlisted}
      title={
        !token
          ? 'Sign in to use watchlist'
          : watchlisted
          ? 'Remove from watchlist'
          : 'Add to watchlist'
      }
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        watchlisted
          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
        isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Star icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill={watchlisted ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={watchlisted ? 0 : 1.5}
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
        />
      </svg>

      {loading ? 'Saving…' : watchlisted ? 'Watchlisted' : 'Watch'}
    </button>
  );
}
