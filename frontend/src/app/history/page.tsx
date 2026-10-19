'use client';

// ============================================================
// BANKERCHANGER — History Page (/history)
// ============================================================

import { useMemo } from 'react';
import Link from 'next/link';
import { useWallet } from '../../hooks/useWallet';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useMarkets } from '../../hooks/useMarkets';
import { ConnectPrompt } from '../../components/ui/ConnectPrompt';
import { PredictionHistory } from '../../components/history/PredictionHistory';
import { useToast } from '../../components/ui/ToastProvider';
import type { Bet } from '../../types';

// ─── HistoryStats ────────────────────────────────────────────────────────────

interface HistoryStatsProps {
  totalPredictions: number;
  wonCount: number;
  lostCount: number;
  pendingCount: number;
}

function HistoryStats({
  totalPredictions,
  wonCount,
  lostCount,
  pendingCount,
}: HistoryStatsProps) {
  const stats = [
    { label: 'Total Predictions', value: String(totalPredictions) },
    { label: 'Won', value: String(wonCount), color: 'text-green-400' },
    { label: 'Lost', value: String(lostCount), color: 'text-red-400' },
    {
      label: 'Pending',
      value: String(pendingCount),
      color: pendingCount > 0 ? 'text-amber-400' : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="bg-gray-900 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">{label}</p>
          <p className={`text-base font-semibold mt-1 break-words ${color ?? 'text-white'}`}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HistoryPage(): JSX.Element {
  const { isConnected } = useWallet();
  const { portfolio, isLoading, claimWinnings, claimRefund } = usePortfolio();
  const { markets } = useMarkets();
  const toast = useToast();

  const marketsMap = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.market_id, m])),
    [markets],
  );

  const allBets: Bet[] = useMemo(() => {
    if (!portfolio) return [];
    return [
      ...portfolio.pending_claims,
      ...portfolio.active_bets,
      ...portfolio.past_bets,
    ];
  }, [portfolio]);

  // Calculate stats
  const stats = useMemo(() => {
    const getBetStatus = (bet: Bet): string => {
      if (bet.claimed) return 'won';
      const payout = bet.payout !== null ? parseFloat(bet.payout) : null;
      if (payout === null) return 'active';
      if (payout > 0) return 'pending';
      return 'lost';
    };

    const wonCount = allBets.filter((bet) => getBetStatus(bet) === 'won').length;
    const lostCount = allBets.filter((bet) => getBetStatus(bet) === 'lost').length;
    const pendingCount = allBets.filter(
      (bet) => getBetStatus(bet) === 'pending',
    ).length;

    return {
      total: allBets.length,
      won: wonCount,
      lost: lostCount,
      pending: pendingCount,
    };
  }, [allBets]);

  if (!isConnected) {
    return (
      <main className="max-w-2xl mx-auto mt-20 px-4">
        <ConnectPrompt message="Connect your Freighter wallet to view your prediction history" />
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="text-center mt-20 text-gray-400">Loading history…</main>
    );
  }

  const isEmpty = allBets.length === 0;

  if (isEmpty) {
    return (
      <main className="text-center mt-20 space-y-3 px-4">
        <p className="text-4xl">📊</p>
        <p className="text-gray-400">
          No predictions yet — check out available markets to get started
        </p>
        <Link href="/" className="inline-block text-amber-400 hover:text-amber-300 text-sm">
          Browse markets →
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-white">Prediction History</h1>
        <Link
          href="/portfolio"
          className="text-sm text-amber-400 hover:text-amber-300"
        >
          View portfolio →
        </Link>
      </div>

      {/* Stats */}
      <HistoryStats
        totalPredictions={stats.total}
        wonCount={stats.won}
        lostCount={stats.lost}
        pendingCount={stats.pending}
      />

      {/* History table */}
      <section>
        <h2 className="text-white font-semibold mb-3">All Predictions</h2>
        <PredictionHistory
          predictions={allBets}
          markets={marketsMap}
          onClaim={claimWinnings}
          onRefund={claimRefund}
          isLoading={isLoading}
        />
      </section>
    </main>
  );
}
