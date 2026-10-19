'use client';

// ============================================================
// BANKERCHANGER — PredictionHistory Component
// ============================================================

import { useState, useMemo } from 'react';
import type { Market, Bet } from '../../types';

type StatusFilter = 'all' | 'active' | 'won' | 'lost' | 'pending_claim';
type SortKey = 'date' | 'amount';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 10;
const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'won', 'lost', 'pending_claim'];

function getBetStatus(bet: Bet): 'Active' | 'Won' | 'Lost' | 'Pending Claim' | 'Claimed' {
  if (bet.claimed) return 'Claimed';
  const payout = bet.payout !== null ? parseFloat(bet.payout) : null;
  if (payout === null) return 'Active';
  if (payout > 0) return 'Pending Claim';
  return 'Lost';
}

interface PredictionHistoryProps {
  predictions: Bet[];
  markets: Record<string, Market>;
  onClaim?: (market_id: string) => void;
  onRefund?: (market_id: string) => void;
  isLoading?: boolean;
}

export function PredictionHistory({
  predictions,
  markets,
  onClaim,
  onRefund,
  isLoading = false,
}: PredictionHistoryProps): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);

  // Apply status filter
  const filtered = useMemo(() => {
    return predictions.filter((bet) => {
      if (statusFilter === 'all') return true;
      const status = getBetStatus(bet);
      if (statusFilter === 'active') return status === 'Active';
      if (statusFilter === 'won') return status === 'Claimed';
      if (statusFilter === 'lost') return status === 'Lost';
      if (statusFilter === 'pending_claim') return status === 'Pending Claim';
      return true;
    });
  }, [predictions, statusFilter]);

  // Apply sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime();
      } else if (sortKey === 'amount') {
        cmp = a.amount_xlm - b.amount_xlm;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDirection]);

  // Apply pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Handle sort toggle
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
    setPage(1);
  };

  // Sort indicator component
  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ' ↕';

  if (isLoading) {
    return (
      <div className="space-y-3">
        <p className="text-gray-500 text-sm text-center py-6">Loading history…</p>
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-gray-500 text-sm text-center py-6">
          No predictions yet — start betting to build your history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => {
              setStatusFilter(filter);
              setPage(1);
            }}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === filter
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {filter === 'all'
              ? 'All'
              : filter === 'active'
              ? 'Active'
              : filter === 'won'
              ? 'Won'
              : filter === 'lost'
              ? 'Lost'
              : 'Pending'}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="text-xs text-gray-500">
        Showing {filtered.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}–
        {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} prediction
        {filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="min-w-full text-sm text-left text-gray-300">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="pb-2 pr-4 whitespace-nowrap">Market</th>
              <th className="pb-2 pr-4 whitespace-nowrap">Prediction</th>
              <th
                className="pb-2 pr-4 whitespace-nowrap cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('amount')}
              >
                Amount<SortIcon col="amount" />
              </th>
              <th className="pb-2 pr-4 whitespace-nowrap">Status</th>
              <th className="pb-2 pr-4 whitespace-nowrap">Payout</th>
              <th
                className="pb-2 pr-4 whitespace-nowrap cursor-pointer hover:text-gray-300 select-none"
                onClick={() => handleSort('date')}
              >
                Date<SortIcon col="date" />
              </th>
              <th className="pb-2 whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-500 text-sm">
                  No predictions match your filter.
                </td>
              </tr>
            ) : (
              paginated.map((bet) => {
                const market = markets[bet.market_id];
                const marketLabel = market
                  ? `${market.fighter_a} vs ${market.fighter_b}`
                  : bet.market_id.slice(0, 8) + '…';
                const sideLabel =
                  bet.side === 'fighter_a'
                    ? market?.fighter_a ?? 'Fighter A'
                    : bet.side === 'fighter_b'
                    ? market?.fighter_b ?? 'Fighter B'
                    : 'Draw';
                const payout =
                  bet.payout !== null ? parseFloat(bet.payout) : null;
                const status = getBetStatus(bet);

                let action: JSX.Element;
                if (status === 'Pending Claim' && onClaim) {
                  action = (
                    <button
                      onClick={() => onClaim(bet.market_id)}
                      className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 font-semibold text-black text-xs"
                    >
                      Claim
                    </button>
                  );
                } else if (payout !== null && payout < 0 && onRefund) {
                  action = (
                    <button
                      onClick={() => onRefund(bet.market_id)}
                      className="min-h-[36px] px-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs"
                    >
                      Refund
                    </button>
                  );
                } else {
                  action = <span className="text-gray-600">—</span>;
                }

                const statusColor =
                  status === 'Claimed'
                    ? 'text-green-400'
                    : status === 'Pending Claim'
                    ? 'text-amber-400'
                    : status === 'Lost'
                    ? 'text-red-400'
                    : 'text-gray-400';

                return (
                  <tr
                    key={`${bet.market_id}-${bet.placed_at}`}
                    className="border-b border-gray-800/50"
                  >
                    <td className="py-3 pr-4 text-xs whitespace-nowrap text-gray-300">
                      {marketLabel}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{sideLabel}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {bet.amount_xlm} XLM
                    </td>
                    <td
                      className={`py-3 pr-4 whitespace-nowrap text-xs font-medium ${statusColor}`}
                    >
                      {status}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {payout !== null && payout >= 0
                        ? `${payout.toFixed(2)} XLM`
                        : '—'}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-xs text-gray-500">
                      {new Date(bet.placed_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 whitespace-nowrap">{action}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-[32px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ←
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-[32px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
