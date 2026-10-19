'use client';

// ============================================================
// BANKERCHANGER — TransactionDetailModal Component
// ============================================================

import { Fragment } from 'react';
import type { Transaction } from '../../hooks/useTransactionHistory';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  market?: {
    fighter_a: string;
    fighter_b: string;
  } | null;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500/10 text-green-400';
    case 'pending':
      return 'bg-amber-500/10 text-amber-400';
    case 'failed':
      return 'bg-red-500/10 text-red-400';
    case 'cancelled':
      return 'bg-gray-500/10 text-gray-400';
    default:
      return 'bg-gray-500/10 text-gray-300';
  }
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

function getTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatAmount(stroops: string): string {
  const amount = BigInt(stroops);
  const xlm = Number(amount) / 1_000_000;
  return xlm.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TransactionDetailModal({
  transaction,
  isOpen,
  onClose,
  market,
}: TransactionDetailModalProps): JSX.Element | null {
  if (!isOpen || !transaction) return null;

  const xlmAmount = formatAmount(transaction.amount);
  const dateFormatted = formatDate(transaction.createdAt);
  const icon = getTypeIcon(transaction.type);
  const typeLabel = getTypeLabel(transaction.type);
  const statusClass = getStatusColor(transaction.status);

  let marketLabel = '';
  if (market) {
    marketLabel = `${market.fighter_a} vs ${market.fighter_b}`;
  }

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-2xl max-w-md w-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{icon}</span>
              <h2 className="text-lg font-semibold text-white">{typeLabel}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <span className="text-xl text-gray-400 hover:text-white">×</span>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-4">
            {/* Amount */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Amount</p>
              <p className="text-2xl font-bold text-white">{xlmAmount} XLM</p>
            </div>

            {/* Status */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusClass}`}>
                {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
              </div>
            </div>

            {/* Date */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Date & Time</p>
              <p className="text-sm text-gray-300">{dateFormatted}</p>
            </div>

            {/* Market (if applicable) */}
            {marketLabel && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Market</p>
                <p className="text-sm text-gray-300">{marketLabel}</p>
              </div>
            )}

            {/* Transaction ID */}
            <div>
              <p className="text-xs text-gray-500 mb-1">Transaction ID</p>
              <p className="text-xs text-gray-400 font-mono truncate">{transaction.id}</p>
            </div>

            {/* TX Hash (if available) */}
            {transaction.tx_hash && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Blockchain Hash</p>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${transaction.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-400 hover:text-amber-300 font-mono truncate break-all"
                >
                  {transaction.tx_hash}
                </a>
              </div>
            )}

            {/* Description (if available) */}
            {transaction.description && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Description</p>
                <p className="text-sm text-gray-300">{transaction.description}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-800 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
