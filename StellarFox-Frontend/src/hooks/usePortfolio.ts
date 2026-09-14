// ============================================================
// BANKERCHANGER — usePortfolio Hook
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Portfolio, TxStatus } from '../types';
import { useWallet } from './useWallet';
import { fetchPortfolio } from '../services/api';
import { submitClaim, submitRefund } from '../services/wallet';

export interface UsePortfolioResult {
  portfolio: Portfolio | null;
  bets: any[];
  isLoading: boolean;
  error: Error | null;
  claimTxStatus: TxStatus;
  page: number;
  limit: number;
  total: number;
  loadNextPage: () => Promise<void>;
  /** Submits claim_winnings for a market contract. Refreshes portfolio after. */
  claimWinnings: (market_contract_address: string) => Promise<void>;
  /** Submits claim_refund for a cancelled market. Refreshes portfolio after. */
  claimRefund: (market_contract_address: string) => Promise<void>;
}

/**
 * Fetches the portfolio for the currently connected wallet.
 * Returns null portfolio if no wallet is connected.
 * Supports paginated bets loading with loadNextPage().
 * 
 * Cache strategy: Portfolio data is stale for 30s and cached for 60s,
 * reducing redundant requests for expensive computation.
 */
export function usePortfolio(): UsePortfolioResult {
  const { address } = useWallet();
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [claimTxStatus, setClaimTxStatus] = useState<TxStatus>({
    hash: null,
    status: 'idle',
    error: null,
  });

  // Query for portfolio data with caching
  const {
    data: portfolio = null,
    isLoading: portfolioLoading,
    error: portfolioError,
    refetch: refetchPortfolio,
  } = useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => (address ? fetchPortfolio(address) : Promise.resolve(null)),
    enabled: !!address,
    staleTime: 30_000, // 30 seconds
    gcTime: 60_000, // 60 seconds (formerly cacheTime)
  });

  // Query for bets with pagination
  const {
    data: betsData,
    isLoading: betsLoading,
    error: betsError,
    refetch: refetchBets,
  } = useQuery({
    queryKey: ['bets', address, page, limit],
    queryFn: async () => {
      if (!address) return { bets: [], total: 0 };
      const response = await fetch(`/api/bets/${address}?page=${page}&limit=${limit}`);
      return response.json();
    },
    enabled: !!address,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const bets = betsData?.bets ?? [];
  const total = betsData?.total ?? 0;
  const isLoading = portfolioLoading || betsLoading;
  const error = portfolioError ?? betsError ?? null;

  // Refresh portfolio on claim success event
  useEffect(() => {
    const handler = () => { refetchPortfolio(); };
    window.addEventListener('bankerchanger:claim_success', handler);
    return () => window.removeEventListener('bankerchanger:claim_success', handler);
  }, [refetchPortfolio]);

  const loadNextPage = useCallback(async () => {
    setPage(prev => prev + 1);
  }, []);

  const runClaim = useCallback(async (fn: () => Promise<string>) => {
    setClaimTxStatus({ hash: null, status: 'signing', error: null });
    try {
      const hash = await fn();
      setClaimTxStatus({ hash, status: 'success', error: null });
      await refetchPortfolio();
    } catch (e: any) {
      setClaimTxStatus({ hash: null, status: 'error', error: e?.message ?? String(e) });
    }
  }, [refetchPortfolio]);

  const claimWinnings = useCallback(
    (market_contract_address: string) =>
      runClaim(() => submitClaim(market_contract_address)),
    [runClaim],
  );

  const claimRefund = useCallback(
    (market_contract_address: string) =>
      runClaim(() => submitRefund(market_contract_address)),
    [runClaim],
  );

  return {
    portfolio,
    bets,
    isLoading,
    error,
    claimTxStatus,
    page,
    limit,
    total,
    loadNextPage,
    claimWinnings,
    claimRefund,
  };
}
