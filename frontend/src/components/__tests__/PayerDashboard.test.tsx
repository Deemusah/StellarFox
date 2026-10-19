import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PayerDashboard from '../../app/payer/page';
import { markPaid } from '@/services/wallet';

jest.mock('@/services/wallet', () => ({
  getConnectedAddress: jest.fn(() => 'GTESTCONNECTEDADDRESS'),
  markPaid: jest.fn(),
}));

jest.mock('@/components/ui/TxStatusToast', () => ({
  TxStatusToast: () => null,
}));

describe('PayerDashboard destructive-action recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(markPaid).mockResolvedValue('transaction-hash');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requires settlement confirmation and can restore the hidden paid invoice row', async () => {
    render(<PayerDashboard />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Settle' })[0]);

    expect(screen.getByRole('dialog')).toHaveTextContent('Confirm Settlement');
    expect(screen.queryByText(/payment remains settled/i)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm & Pay' }));
      await Promise.resolve();
    });

    expect(markPaid).toHaveBeenCalledWith('INV-1001');
    expect(screen.getByText('Paid')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/payment remains settled/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo removal' }));
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText(/payment remains settled/i)).not.toBeInTheDocument();
  });
});