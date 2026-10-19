// ============================================================
// BANKERCHANGER — useTransactionHistory Hook
// ============================================================

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from './useWallet';

export type TransactionType = 'bet' | 'claim' | 'refund' | 'deposit' | 'withdrawal';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: string; // stroops/smallest unit
  status: TransactionStatus;
  marketId?: string;
  createdAt: string;
  updatedAt?: string;
  tx_hash?: string;
  description?: string;
}

export interface TransactionHistoryResponse {
  data: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  filters: {
    type?: TransactionType;
    status?: TransactionStatus;
    dateRange?: { from?: string; to?: string };
    amountRange?: { min?: number; max?: number };
  };
}

export interface TransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  from?: string;
  to?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'created_at' | 'amount' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface UseTransactionHistoryResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  filters: TransactionFilters;
  setFilters: (filters: TransactionFilters) => void;
  setPage: (page: number) => void;
  goNextPage: () => void;
  goPrevPage: () => void;
  refetch: () => Promise<void>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchTransactionHistory(
  filters: TransactionFilters,
  page: number,
  limit: number,
): Promise<TransactionHistoryResponse> {
  const params = new URLSearchParams();

  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.minAmount !== undefined) params.set('minAmount', filters.minAmount.toString());
  if (filters.maxAmount !== undefined) params.set('maxAmount', filters.maxAmount.toString());
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

  params.set('page', page.toString());
  params.set('limit', limit.toString());

  const qs = params.toString();
  const url = `${API_BASE}/api/v1/transactions${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // Auth token will be added by wallet context if available
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch transaction history: ${res.status} ${error}`);
  }

  return res.json();
}

/**
 * Fetches transaction history for the current user with filtering and pagination.
 * Provides hooks to update filters and navigate pages.
 *
 * Cache strategy: Data is stale for 30s and cached for 60s.
 */
export function useTransactionHistory(): UseTransactionHistoryResult {
  const { isConnected } = useWallet();
  const [page, setPageState] = useState(1);
  const [limit] = useState(20);
  const [filters, setFilters] = useState<TransactionFilters>({
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const {
    data: response = null,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['transactionHistory', filters, page, limit],
    queryFn: () => fetchTransactionHistory(filters, page, limit),
    enabled: isConnected,
    staleTime: 30_000, // 30 seconds
    gcTime: 60_000, // 60 seconds
  });

  const transactions = response?.data ?? [];
  const pagination = response?.pagination ?? {
    page,
    limit,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  };

  const setPage = useCallback(
    (newPage: number) => {
      setPageState(Math.max(1, Math.min(newPage, pagination.totalPages || 1)));
    },
    [pagination.totalPages],
  );

  const goNextPage = useCallback(() => {
    if (pagination.hasNext) {
      setPage(page + 1);
    }
  }, [page, pagination.hasNext, setPage]);

  const goPrevPage = useCallback(() => {
    if (pagination.hasPrev) {
      setPage(page - 1);
    }
  }, [page, pagination.hasPrev, setPage]);

  const handleRefetch = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    transactions,
    isLoading,
    error: error instanceof Error ? error : null,
    page: pagination.page,
    limit: pagination.limit,
    total: pagination.total,
    totalPages: pagination.totalPages,
    hasNext: pagination.hasNext,
    hasPrev: pagination.hasPrev,
    filters,
    setFilters: (newFilters) => {
      setFilters(newFilters);
      setPageState(1); // Reset to page 1 when filters change
    },
    setPage,
    goNextPage,
    goPrevPage,
    refetch: handleRefetch,
  };
}
