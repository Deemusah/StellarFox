'use client';

// ============================================================
// BANKERCHANGER — Transaction History Page (/transactions)
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '../../hooks/useWallet';
import { useTransactionHistory, type TransactionType, type TransactionStatus, type Transaction } from '../../hooks/useTransactionHistory';
import { useMarkets } from '../../hooks/useMarkets';
import { ConnectPrompt } from '../../components/ui/ConnectPrompt';
import { TransactionDetailModal } from '../../components/transaction/TransactionDetailModal';
import { useToast } from '../../components/ui/ToastProvider';

// ─── TransactionTable ─────────────────────────────────────────────────────────

interface TransactionTableProps {
  transactions: Transaction[];
  markets: Record<string, any>;
  onSelectTransaction: (tx: Transaction) => void;
  isLoading: boolean;
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'bet':
      return '🎯';
    case 'claim':
      return '✅';
    case 'refund':
      return '↩️';
    case 'deposit':
      return '💰';
    case 'withdrawal':
      return '🏦';
    default:
      return '📝';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-green-400';
    case 'pending':
      return 'text-amber-400';
    case 'failed':
      return 'text-red-400';
    case 'cancelled':
      return 'text-gray-400';
    default:
      return 'text-gray-300';
  }
}

function formatAmount(stroops: string): string {
  const amount = BigInt(stroops);
  const xlm = Number(amount) / 1_000_000;
  return xlm.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
}

function TransactionTable({
  transactions,
  markets,
  onSelectTransaction,
  isLoading,
}: TransactionTableProps): JSX.Element {
  if (isLoading) {
    return <div className="text-center py-8 text-gray-400">Loading transactions…</div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No transactions yet</p>
        <p className="text-xs mt-1">Start placing bets to see your transaction history</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="min-w-full text-sm text-left text-gray-300">
        <thead>
          <tr className="text-xs text-gray-500 border-b border-gray-800">
            <th className="pb-2 pr-4 whitespace-nowrap">Type</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Amount</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Status</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Market</th>
            <th className="pb-2 pr-4 whitespace-nowrap">Date</th>
            <th className="pb-2 whitespace-nowrap">Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const market = markets[tx.marketId || ''];
            const marketLabel = market
              ? `${market.fighter_a} vs ${market.fighter_b}`
              : tx.marketId?.slice(0, 8) + '…' || '—';
            const icon = getTypeIcon(tx.type);
            const statusClass = getStatusColor(tx.status);

            return (
              <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors" onClick={() => onSelectTransaction(tx)}>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="text-lg mr-2">{icon}</span>
                  <span className="text-xs font-medium">{tx.type}</span>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap font-mono text-white">{formatAmount(tx.amount)} XLM</td>
                <td className={`py-3 pr-4 whitespace-nowrap text-xs font-medium ${statusClass}`}>
                  {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-xs text-gray-400">{marketLabel}</td>
                <td className="py-3 pr-4 whitespace-nowrap text-xs text-gray-500">
                  {new Date(tx.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3 whitespace-nowrap">
                  <button
                    className="min-h-[32px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTransaction(tx);
                    }}
                  >
                    Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── FilterPanel ──────────────────────────────────────────────────────────────

interface FilterPanelProps {
  filters: any;
  onFilterChange: (filters: any) => void;
}

function FilterPanel({ filters, onFilterChange }: FilterPanelProps): JSX.Element {
  const typeOptions: TransactionType[] = ['bet', 'claim', 'refund', 'deposit', 'withdrawal'];
  const statusOptions: TransactionStatus[] = ['pending', 'completed', 'failed', 'cancelled'];

  const handleTypeChange = (type: TransactionType | '') => {
    onFilterChange({
      ...filters,
      type: type || undefined,
    });
  };

  const handleStatusChange = (status: TransactionStatus | '') => {
    onFilterChange({
      ...filters,
      status: status || undefined,
    });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [sortBy, sortOrder] = e.target.value.split(':') as [string, string];
    onFilterChange({
      ...filters,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
    });
  };

  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-3 border border-gray-800">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Type Filter */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Type</label>
          <select
            value={filters.type || ''}
            onChange={(e) => handleTypeChange(e.target.value as TransactionType | '')}
            className="w-full h-10 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Status</label>
          <select
            value={filters.status || ''}
            onChange={(e) => handleStatusChange(e.target.value as TransactionStatus | '')}
            className="w-full h-10 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Sort By</label>
          <select
            value={`${filters.sortBy}:${filters.sortOrder}`}
            onChange={handleSortChange}
            className="w-full h-10 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="created_at:desc">Newest First</option>
            <option value="created_at:asc">Oldest First</option>
            <option value="amount:desc">Largest Amount</option>
            <option value="amount:asc">Smallest Amount</option>
            <option value="status:asc">Status (A-Z)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TransactionsPage(): JSX.Element {
  const { isConnected } = useWallet();
  const { markets } = useMarkets();
  const {
    transactions,
    isLoading,
    error,
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
    filters,
    setFilters,
    setPage,
    goNextPage,
    goPrevPage,
    refetch,
  } = useTransactionHistory();

  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const toast = useToast();

  const marketsMap = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.market_id, m])),
    [markets],
  );

  const handleSelectTransaction = useCallback((tx: Transaction) => {
    setSelectedTransaction(tx);
    setDetailsOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailsOpen(false);
    setSelectedTransaction(null);
  }, []);

  if (!isConnected) {
    return (
      <main className="max-w-4xl mx-auto mt-20 px-4">
        <ConnectPrompt message="Connect your Freighter wallet to view your transaction history" />
      </main>
    );
  }

  if (error && !isLoading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          Failed to load transactions: {error.message}
          <button
            onClick={() => refetch()}
            className="ml-4 px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Transaction History</h1>
          <p className="text-sm text-gray-400 mt-1">View and track all your platform transactions</p>
        </div>
        <button
          onClick={() => refetch()}
          className="min-h-[44px] px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium text-sm transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      <FilterPanel filters={filters} onFilterChange={setFilters} />

      {/* Summary Stats */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
            <p className="text-xs text-gray-400">Total Transactions</p>
            <p className="text-2xl font-bold text-white mt-1">{total}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
            <p className="text-xs text-gray-400">Current Page</p>
            <p className="text-2xl font-bold text-white mt-1">
              {page} / {totalPages}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
            <p className="text-xs text-gray-400">Per Page</p>
            <p className="text-2xl font-bold text-white mt-1">{limit}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 text-center border border-gray-800">
            <p className="text-xs text-gray-400">Total Shown</p>
            <p className="text-2xl font-bold text-white mt-1">{transactions.length}</p>
          </div>
        </div>
      )}

      {/* Transaction Table */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <TransactionTable
          transactions={transactions}
          markets={marketsMap}
          onSelectTransaction={handleSelectTransaction}
          isLoading={isLoading}
        />
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-gray-400">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} transactions
          </div>

          <div className="flex gap-2">
            <button
              onClick={goPrevPage}
              disabled={!hasPrev}
              className="min-h-[40px] px-4 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              ← Previous
            </button>
            <div className="flex items-center px-3 text-sm text-gray-400">
              Page {page} of {totalPages}
            </div>
            <button
              onClick={goNextPage}
              disabled={!hasNext}
              className="min-h-[40px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-medium text-sm transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={selectedTransaction}
        isOpen={detailsOpen}
        onClose={handleCloseDetails}
        market={selectedTransaction?.marketId ? marketsMap[selectedTransaction.marketId] : null}
      />
    </main>
  );
}
