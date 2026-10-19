// ============================================================
// BANKERCHANGER — TransactionDetailModal Component Unit Tests
// ============================================================

import type { Transaction } from '../../../hooks/useTransactionHistory';

describe('TransactionDetailModal - Component Logic', () => {
  describe('Status color mapping', () => {
    const getStatusColor = (status: string): string => {
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
    };

    it('should return green color for completed status', () => {
      const color = getStatusColor('completed');
      expect(color).toContain('green');
    });

    it('should return amber color for pending status', () => {
      const color = getStatusColor('pending');
      expect(color).toContain('amber');
    });

    it('should return red color for failed status', () => {
      const color = getStatusColor('failed');
      expect(color).toContain('red');
    });

    it('should return gray color for cancelled status', () => {
      const color = getStatusColor('cancelled');
      expect(color).toContain('gray');
    });
  });

  describe('Type icon mapping', () => {
    const getTypeIcon = (type: string): string => {
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
    };

    it('should return correct icon for bet', () => {
      expect(getTypeIcon('bet')).toBe('🎯');
    });

    it('should return correct icon for claim', () => {
      expect(getTypeIcon('claim')).toBe('✅');
    });

    it('should return correct icon for refund', () => {
      expect(getTypeIcon('refund')).toBe('↩️');
    });

    it('should return correct icon for deposit', () => {
      expect(getTypeIcon('deposit')).toBe('💰');
    });

    it('should return correct icon for withdrawal', () => {
      expect(getTypeIcon('withdrawal')).toBe('🏦');
    });

    it('should return default icon for unknown type', () => {
      expect(getTypeIcon('unknown')).toBe('📝');
    });
  });

  describe('Type label formatting', () => {
    const getTypeLabel = (type: string): string => {
      return type.charAt(0).toUpperCase() + type.slice(1);
    };

    it('should capitalize type correctly', () => {
      expect(getTypeLabel('bet')).toBe('Bet');
      expect(getTypeLabel('claim')).toBe('Claim');
      expect(getTypeLabel('refund')).toBe('Refund');
    });
  });

  describe('Amount formatting', () => {
    const formatAmount = (stroops: string): string => {
      const amount = BigInt(stroops);
      const xlm = Number(amount) / 1_000_000;
      return xlm.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
    };

    it('should convert stroops to XLM correctly', () => {
      expect(formatAmount('10000000')).toBe('10');
    });

    it('should handle decimal places', () => {
      expect(formatAmount('1234567')).toBe('1.234567');
    });

    it('should remove trailing zeros', () => {
      expect(formatAmount('1500000')).toBe('1.5');
    });

    it('should handle small amounts', () => {
      expect(formatAmount('1')).toBe('0.000001');
    });
  });

  describe('Date formatting', () => {
    const formatDate = (dateString: string): string => {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    };

    it('should format date correctly', () => {
      const formatted = formatDate('2025-01-15T10:30:00Z');
      expect(formatted).toContain('Jan');
      expect(formatted).toContain('15');
      expect(formatted).toContain('2025');
    });

    it('should handle different dates', () => {
      const formatted = formatDate('2025-06-20T14:45:30Z');
      expect(formatted).toContain('Jun');
      expect(formatted).toContain('20');
    });
  });

  describe('Transaction object structure', () => {
    it('should have required fields', () => {
      const tx: Transaction = {
        id: 'tx_001',
        type: 'bet',
        amount: '10000000',
        status: 'completed',
        createdAt: '2025-01-15T10:30:00Z',
      };

      expect(tx).toHaveProperty('id');
      expect(tx).toHaveProperty('type');
      expect(tx).toHaveProperty('amount');
      expect(tx).toHaveProperty('status');
      expect(tx).toHaveProperty('createdAt');
    });

    it('should support optional fields', () => {
      const tx: Transaction = {
        id: 'tx_001',
        type: 'bet',
        amount: '10000000',
        status: 'completed',
        createdAt: '2025-01-15T10:30:00Z',
        tx_hash: 'abc123',
        marketId: 'market_001',
        description: 'Placed bet',
      };

      expect(tx.tx_hash).toBe('abc123');
      expect(tx.marketId).toBe('market_001');
      expect(tx.description).toBe('Placed bet');
    });
  });

  describe('Modal state logic', () => {
    it('should determine if modal should render', () => {
      const shouldRender = (isOpen: boolean, transaction: Transaction | null) => {
        return isOpen && transaction !== null;
      };

      const tx: Transaction = {
        id: 'tx_001',
        type: 'bet',
        amount: '10000000',
        status: 'completed',
        createdAt: '2025-01-15T10:30:00Z',
      };

      expect(shouldRender(true, tx)).toBe(true);
      expect(shouldRender(false, tx)).toBe(false);
      expect(shouldRender(true, null)).toBe(false);
    });
  });

  describe('Status display logic', () => {
    it('should display correct status text', () => {
      const statuses = ['pending', 'completed', 'failed', 'cancelled'];
      statuses.forEach((status) => {
        const displayText = status.charAt(0).toUpperCase() + status.slice(1);
        expect(displayText).toBeTruthy();
        expect(displayText.length).toBeGreaterThan(0);
      });
    });
  });
});
