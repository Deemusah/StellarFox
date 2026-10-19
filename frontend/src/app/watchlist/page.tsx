'use client';

// ============================================================
// BANKERCHANGER — Watchlist Page (/watchlist)
// Shows markets the authenticated user is watching.
// ============================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWatchlist } from '../../hooks/useWatchlist';
import { MarketStatusBadge } from '../../components/market/MarketStatusBadge';
import { ConnectPrompt } from '../../components/ui/ConnectPrompt';
import type { WatchlistMarket } from '../../types';

// ─── WatchlistCard ────────────────────────────────────────────────────────────

interface WatchlistCardProps {
  market: WatchlistMarket;
  onRemove: (id: string) => Promise<void>;
}

function WatchlistCard({ market, onRemove }: WatchlistCardProps): JSX.Element {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await onRemove(market.id);
    } finally {
      setRemoving(false);
    }
  };

  const watchedSince = new Date(market.watchlisted_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const closingDate = market.closing_at
    ? new Date(market.closing_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-3">
      {/* Fighters + status */}
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/markets/${market.id}`}
          className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <h3 className="text-white font-semibold text-sm truncate">
            {market.title || `${market.fighter_a} vs ${market.fighter_b}`}
          </h3>
          <p className="text-gray-400 text-xs mt-0.5 truncate">
            {market.fighter_a} <span className="text-gray-600">vs</span> {market.fighter_b}
          </p>
        </Link>

        <MarketStatusBadge status={market.status as 'open' | 'locked' | 'resolved' | 'cancelled'} />
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-gray-500 gap-2 flex-wrap">
        <span>Watched since {watchedSince}</span>
        {closingDate && <span>Closes {closingDate}</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/markets/${market.id}`}
          className="flex-1 text-center rounded-lg py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
        >
          View Market
        </Link>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          aria-label="Remove from watchlist"
          className="rounded-lg py-1.5 px-3 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {removing ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WatchlistPage(): JSX.Element {
  // Retrieve JWT token from localStorage — set by the auth flow when a user
  // signs in. The token is optional; if absent, we show a connect prompt.
  const [token, setToken] = useState<string | undefined>(undefined);
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bankerchanger_access_token') ?? undefined;
      setToken(stored);
      setTokenChecked(true);
    }
  }, []);

  const { watchlist, isLoading, error, remove } = useWatchlist(token);

  // ─ Not yet checked ──────────────────────────────────────────────────────────
  if (!tokenChecked) {
    return (
      <main className="text-center mt-20 text-gray-400">
        <span className="animate-pulse">Loading…</span>
      </main>
    );
  }

  // ─ Not authenticated ────────────────────────────────────────────────────────
  if (!token) {
    return (
      <main className="max-w-2xl mx-auto mt-20 px-4">
        <ConnectPrompt message="Sign in to view your watchlist" />
      </main>
    );
  }

  // ─ Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <main className="text-center mt-20 text-gray-400">
        <span className="animate-pulse">Loading watchlist…</span>
      </main>
    );
  }

  // ─ Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="max-w-2xl mx-auto mt-20 px-4 text-center space-y-3">
        <p className="text-red-400 text-sm">Failed to load watchlist: {error.message}</p>
        <Link href="/" className="inline-block text-amber-400 hover:text-amber-300 text-sm">
          ← Back to markets
        </Link>
      </main>
    );
  }

  // ─ Empty ────────────────────────────────────────────────────────────────────
  if (watchlist.length === 0) {
    return (
      <main className="max-w-2xl mx-auto mt-20 px-4 text-center space-y-4">
        <p className="text-4xl" aria-hidden="true">⭐</p>
        <h1 className="text-white text-lg font-semibold">Your watchlist is empty</h1>
        <p className="text-gray-400 text-sm">
          Tap the <strong className="text-white">Watch</strong> button on any market to follow it here.
        </p>
        <Link href="/" className="inline-block text-amber-400 hover:text-amber-300 text-sm">
          Browse markets →
        </Link>
      </main>
    );
  }

  // ─ Watchlist grid ───────────────────────────────────────────────────────────
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-white">
          My Watchlist{' '}
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({watchlist.length} {watchlist.length === 1 ? 'market' : 'markets'})
          </span>
        </h1>
        <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">
          + Add markets
        </Link>
      </div>

      {/* Grid */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        role="list"
        aria-label="Watchlisted markets"
      >
        {watchlist.map((market) => (
          <div key={market.id} role="listitem">
            <WatchlistCard market={market} onRemove={remove} />
          </div>
        ))}
      </div>
    </main>
  );
}
