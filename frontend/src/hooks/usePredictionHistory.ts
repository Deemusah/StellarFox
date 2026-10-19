'use client';

// ============================================================
// BANKERCHANGER — usePredictionHistory Hook
// ============================================================

import { useCallback, useMemo } from 'react';
import { usePortfolio } from './usePortfolio';
import type { Bet, Market } from '../types';

export interface PredictionHistoryOptions {
  statusFilter?: 'all' | 'active' | 'won' | 'lost' | 'pending_claim';
  sortBy?: 'date' | 'amount';
  sortDirection?: 'asc' | 'desc';
}

export interface PredictionWithMarket extends Bet {
  marketLabel?: string;
  sideLabel?: string;
  statusLabel?: 'Active' | 'Won' | 'Lost' | 'Pending Claim' | 'Claimed';
}

function getBetStatus(bet: Bet): 'Active' | 'Won' | 'Lost' | 'Pending Claim' | 'Claimed' {
  if (bet.claimed) return 'Claimed';
  const payout = bet.payout !== null ? parseFloat(bet.payout) : null;
  if (payout === null) return 'Active';
  if (payout > 0) return 'Pending Claim';
  return 'Lost';
}

/**
 * Hook for fetching and filtering prediction history
 * @param markets - Map of market_id to Market details
 * @param options - Filtering and sorting options
 * @returns Filtered and sorted predictions with metadata
 */
export function usePredictionHistory(
  markets: Record<string, Market> = {},
  options: PredictionHistoryOptions = {}
) {
  const { statusFilter = 'all', sortBy = 'date', sortDirection = 'desc' } = options;
  const { portfolio, isLoading } = usePortfolio();

  // Combine all bets from portfolio
  const allBets = useMemo(() => {
    if (!portfolio) return [];
    return [
      ...portfolio.pending_claims,
      ...portfolio.active_bets,
      ...portfolio.past_bets,
    ];
  }, [portfolio]);

  // Filter bets based on status
  const filtered = useMemo(() => {
    return allBets.filter((bet) => {
      if (statusFilter === 'all') return true;
      const status = getBetStatus(bet);
      if (statusFilter === 'active') return status === 'Active';
      if (statusFilter === 'won') return status === 'Claimed';
      if (statusFilter === 'lost') return status === 'Lost';
      if (statusFilter === 'pending_claim') return status === 'Pending Claim';
      return true;
    });
  }, [allBets, statusFilter]);

  // Sort bets
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime();
      } else if (sortBy === 'amount') {
        cmp = a.amount_xlm - b.amount_xlm;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortBy, sortDirection]);

  // Enrich with market and display data
  const enriched = useMemo(() => {
    return sorted.map((bet) => {
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
      const statusLabel = getBetStatus(bet);

      return {
        ...bet,
        marketLabel,
        sideLabel,
        statusLabel,
      };
    });
  }, [sorted, markets]);

  return {
    predictions: enriched,
    totalCount: allBets.length,
    filteredCount: sorted.length,
    isLoading,
  };
}
