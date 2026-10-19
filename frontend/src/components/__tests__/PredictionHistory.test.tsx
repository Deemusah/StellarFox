import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PredictionHistory } from '../../components/history/PredictionHistory';
import type { Bet, Market } from '../../types';

describe('PredictionHistory Component', () => {
  const mockBets: Bet[] = [
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
  ];

  const mockMarkets: Record<string, Market> = {
    market1: {
      market_id: 'market1',
      fighter_a: 'Mike Tyson',
      fighter_b: 'Evander Holyfield',
      status: 'open',
    } as Market,
    market2: {
      market_id: 'market2',
      fighter_a: 'Muhammad Ali',
      fighter_b: 'Joe Frazier',
      status: 'resolved',
    } as Market,
    market3: {
      market_id: 'market3',
      fighter_a: 'Sugar Ray Leonard',
      fighter_b: 'Marvin Hagler',
      status: 'resolved',
    } as Market,
    market4: {
      market_id: 'market4',
      fighter_a: 'Lennox Lewis',
      fighter_b: 'Mike Tyson',
      status: 'locked',
    } as Market,
  };

  it('renders loading state', () => {
    render(
      <PredictionHistory
        predictions={[]}
        markets={{}}
        isLoading={true}
      />
    );

    expect(screen.getByText('Loading history…')).toBeInTheDocument();
  });

  it('renders empty state when no predictions', () => {
    render(
      <PredictionHistory
        predictions={[]}
        markets={{}}
      />
    );

    expect(
      screen.getByText(/No predictions yet/i)
    ).toBeInTheDocument();
  });

  it('renders table with all predictions', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    expect(screen.getByText('Mike Tyson vs Evander Holyfield')).toBeInTheDocument();
    expect(screen.getByText('Muhammad Ali vs Joe Frazier')).toBeInTheDocument();
    expect(screen.getByText('100 XLM')).toBeInTheDocument();
    expect(screen.getByText('50 XLM')).toBeInTheDocument();
  });

  it('displays correct fighter names for each side', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    expect(screen.getByText('Mike Tyson')).toBeInTheDocument();
    expect(screen.getByText('Joe Frazier')).toBeInTheDocument();
    expect(screen.getByText('Draw')).toBeInTheDocument();
  });

  it('filters by All status', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    const allButton = screen.getByText('All');
    expect(allButton).toBeInTheDocument();
    fireEvent.click(allButton);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(5); // header + 4 data rows
  });

  it('filters by Active status', () => {
    const { container } = render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    const activeButton = screen.getByText('Active');
    fireEvent.click(activeButton);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + 1 active bet
    expect(screen.getByText('100 XLM')).toBeInTheDocument();
  });

  it('filters by Won status', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    const wonButton = screen.getByText('Won');
    fireEvent.click(wonButton);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + 1 won bet
  });

  it('filters by Lost status', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    const lostButton = screen.getByText('Lost');
    fireEvent.click(lostButton);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + 1 lost bet
  });

  it('filters by Pending status', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    const pendingButton = screen.getByText('Pending');
    fireEvent.click(pendingButton);

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + 1 pending bet
  });

  it('sorts by date ascending', () => {
    const { container } = render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    const dateHeader = screen.getByText(/Date/);
    fireEvent.click(dateHeader);
    fireEvent.click(dateHeader); // Toggle to ascending

    const cells = container.querySelectorAll('tbody td:nth-child(1)');
    expect(cells[0].textContent).toContain('Mike Tyson');
  });

  it('displays correct status colors', () => {
    const { container } = render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    // Check for status color classes
    expect(container.querySelector('.text-green-400')).toBeInTheDocument(); // Won
    expect(container.querySelector('.text-red-400')).toBeInTheDocument(); // Lost
    expect(container.querySelector('.text-amber-400')).toBeInTheDocument(); // Pending
  });

  it('displays payout information', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    expect(screen.getByText('75.00 XLM')).toBeInTheDocument(); // Won payout
    expect(screen.getAllByText('—')).toHaveLength(4); // Lost and active have no payout display
  });

  it('calls onClaim when Claim button is clicked', () => {
    const mockOnClaim = jest.fn();
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
        onClaim={mockOnClaim}
      />
    );

    const pendingButton = screen.getByText('Pending');
    fireEvent.click(pendingButton);

    const claimButton = screen.getByText('Claim');
    fireEvent.click(claimButton);

    expect(mockOnClaim).toHaveBeenCalledWith('market4');
  });

  it('calls onRefund when Refund button is clicked', () => {
    const mockOnRefund = jest.fn();
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
        onRefund={mockOnRefund}
      />
    );

    const lostButton = screen.getByText('Lost');
    fireEvent.click(lostButton);

    const refundButton = screen.getByText('Refund');
    fireEvent.click(refundButton);

    expect(mockOnRefund).toHaveBeenCalledWith('market3');
  });

  it('handles pagination correctly', () => {
    const manyBets = Array.from({ length: 15 }, (_, i) => ({
      ...mockBets[0],
      id: i,
      tx_hash: `tx${i}`,
      placed_at: new Date(2025, 0, i + 1).toISOString(),
      market_id: `market${i}`,
    }));

    render(
      <PredictionHistory
        predictions={manyBets}
        markets={mockMarkets}
      />
    );

    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(11); // header + 10 rows per page
  });

  it('displays results count', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    expect(screen.getByText(/Showing.*of.*prediction/)).toBeInTheDocument();
  });

  it('displays correct fighter names from market data', () => {
    render(
      <PredictionHistory
        predictions={mockBets}
        markets={mockMarkets}
      />
    );

    expect(screen.getByText('Mike Tyson vs Evander Holyfield')).toBeInTheDocument();
    expect(screen.getByText('Muhammad Ali vs Joe Frazier')).toBeInTheDocument();
  });

  it('handles market data gracefully when market not found', () => {
    const partialMarkets: Record<string, Market> = {
      market1: mockMarkets.market1,
    };

    render(
      <PredictionHistory
        predictions={mockBets}
        markets={partialMarkets}
      />
    );

    expect(screen.getByText('Mike Tyson vs Evander Holyfield')).toBeInTheDocument();
    expect(screen.getByText('market2…')).toBeInTheDocument(); // Shortened ID for unknown market
  });
});
