import { renderHook } from '@testing-library/react';
import { usePredictionHistory } from '../usePredictionHistory';
import type { Bet, Market } from '../../types';

// Mock the usePortfolio hook
jest.mock('../usePortfolio', () => ({
  usePortfolio: jest.fn(() => ({
    portfolio: {
      address: 'GTEST123',
      active_bets: [],
      past_bets: [
        {
          id: 1,
          market_id: 'market1',
          bettor_address: 'GTEST123',
          side: 'fighter_a',
          amount: '100',
          amount_xlm: 100,
          placed_at: '2025-01-01T10:00:00Z',
          claimed: false,
          claimed_at: null,
          payout: null,
          tx_hash: 'tx1',
          ledger_sequence: 123,
        } as Bet,
        {
          id: 2,
          market_id: 'market2',
          bettor_address: 'GTEST123',
          side: 'fighter_b',
          amount: '50',
          amount_xlm: 50,
          placed_at: '2025-01-02T10:00:00Z',
          claimed: true,
          claimed_at: '2025-01-03T10:00:00Z',
          payout: '75',
          tx_hash: 'tx2',
          ledger_sequence: 124,
        } as Bet,
        {
          id: 3,
          market_id: 'market3',
          bettor_address: 'GTEST123',
          side: 'draw',
          amount: '25',
          amount_xlm: 25,
          placed_at: '2025-01-03T10:00:00Z',
          claimed: false,
          claimed_at: null,
          payout: '-25',
          tx_hash: 'tx3',
          ledger_sequence: 125,
        } as Bet,
      ],
      pending_claims: [
        {
          id: 4,
          market_id: 'market4',
          bettor_address: 'GTEST123',
          side: 'fighter_a',
          amount: '200',
          amount_xlm: 200,
          placed_at: '2025-01-04T10:00:00Z',
          claimed: false,
          claimed_at: null,
          payout: '150',
          tx_hash: 'tx4',
          ledger_sequence: 126,
        } as Bet,
      ],
      total_staked_xlm: 375,
      total_won_xlm: 75,
      total_lost_xlm: 25,
    },
    isLoading: false,
    claimWinnings: jest.fn(),
    claimRefund: jest.fn(),
    claimTxStatus: { status: 'idle' },
  })),
}));

describe('usePredictionHistory', () => {
  it('should return all bets when no filter is applied', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'all' })
    );

    expect(result.current.predictions).toHaveLength(4);
    expect(result.current.totalCount).toBe(4);
    expect(result.current.filteredCount).toBe(4);
  });

  it('should filter by active status', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'active' })
    );

    expect(result.current.predictions).toHaveLength(1);
    expect(result.current.predictions[0].market_id).toBe('market1');
  });

  it('should filter by won status', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'won' })
    );

    expect(result.current.predictions).toHaveLength(1);
    expect(result.current.predictions[0].market_id).toBe('market2');
  });

  it('should filter by lost status', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'lost' })
    );

    expect(result.current.predictions).toHaveLength(1);
    expect(result.current.predictions[0].market_id).toBe('market3');
  });

  it('should filter by pending_claim status', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'pending_claim' })
    );

    expect(result.current.predictions).toHaveLength(1);
    expect(result.current.predictions[0].market_id).toBe('market4');
  });

  it('should sort by date ascending', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { sortBy: 'date', sortDirection: 'asc' })
    );

    expect(result.current.predictions[0].market_id).toBe('market1');
    expect(result.current.predictions[3].market_id).toBe('market4');
  });

  it('should sort by date descending', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { sortBy: 'date', sortDirection: 'desc' })
    );

    expect(result.current.predictions[0].market_id).toBe('market4');
    expect(result.current.predictions[3].market_id).toBe('market1');
  });

  it('should sort by amount ascending', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { sortBy: 'amount', sortDirection: 'asc' })
    );

    expect(result.current.predictions[0].amount_xlm).toBe(25);
    expect(result.current.predictions[3].amount_xlm).toBe(200);
  });

  it('should sort by amount descending', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { sortBy: 'amount', sortDirection: 'desc' })
    );

    expect(result.current.predictions[0].amount_xlm).toBe(200);
    expect(result.current.predictions[3].amount_xlm).toBe(25);
  });

  it('should enrich predictions with market data', () => {
    const mockMarkets: Record<string, Market> = {
      market1: {
        market_id: 'market1',
        fighter_a: 'Fighter A',
        fighter_b: 'Fighter B',
        status: 'open',
      } as Market,
    };

    const { result } = renderHook(() =>
      usePredictionHistory(mockMarkets, { statusFilter: 'all' })
    );

    const market1Pred = result.current.predictions.find(
      (p) => p.market_id === 'market1'
    );
    expect(market1Pred?.marketLabel).toBe('Fighter A vs Fighter B');
    expect(market1Pred?.sideLabel).toBe('Fighter A');
    expect(market1Pred?.statusLabel).toBe('Active');
  });

  it('should generate market label for unknown market', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'all' })
    );

    const pred = result.current.predictions[0];
    expect(pred.marketLabel).toBe('market1' + '…');
  });

  it('should filter and sort correctly combined', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, {
        statusFilter: 'all',
        sortBy: 'amount',
        sortDirection: 'asc',
      })
    );

    expect(result.current.predictions).toHaveLength(4);
    expect(result.current.predictions[0].amount_xlm).toBe(25);
    expect(result.current.predictions[1].amount_xlm).toBe(50);
    expect(result.current.predictions[2].amount_xlm).toBe(100);
    expect(result.current.predictions[3].amount_xlm).toBe(200);
  });

  it('should return correct counts', () => {
    const { result } = renderHook(() =>
      usePredictionHistory({}, { statusFilter: 'won' })
    );

    expect(result.current.totalCount).toBe(4);
    expect(result.current.filteredCount).toBe(1);
  });
});
