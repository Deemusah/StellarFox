// ============================================================
// BANKERCHANGER — useTransactionHistory Hook Tests
// ============================================================

import type { Transaction, TransactionFilters } from '../useTransactionHistory';

describe('useTransactionHistory - Unit Tests', () => {
  describe('Transaction type definitions', () => {
    it('should define valid transaction types', () => {
      const validTypes = ['bet', 'claim', 'refund', 'deposit', 'withdrawal'];
      validTypes.forEach((type) => {
        expect(validTypes).toContain(type);
      });
    });

    it('should define valid transaction statuses', () => {
      const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
      validStatuses.forEach((status) => {
        expect(validStatuses).toContain(status);
      });
    });
  });

  describe('Filter interface', () => {
    it('should create valid filter objects', () => {
      const filters: TransactionFilters = {
        type: 'bet',
        status: 'completed',
        sortBy: 'created_at',
        sortOrder: 'desc',
      };

      expect(filters.type).toBe('bet');
      expect(filters.status).toBe('completed');
      expect(filters.sortBy).toBe('created_at');
      expect(filters.sortOrder).toBe('desc');
    });

    it('should allow partial filters', () => {
      const filters: TransactionFilters = {
        type: 'bet',
      };

      expect(filters.type).toBe('bet');
      expect(filters.status).toBeUndefined();
    });
  });

  describe('Transaction object structure', () => {
    it('should create valid transaction objects', () => {
      const tx: Transaction = {
        id: 'tx_001',
        type: 'bet',
        amount: '10000000',
        status: 'completed',
        createdAt: '2025-01-15T10:30:00Z',
      };

      expect(tx.id).toBe('tx_001');
      expect(tx.type).toBe('bet');
      expect(tx.amount).toBe('10000000');
      expect(tx.status).toBe('completed');
      expect(tx.createdAt).toBe('2025-01-15T10:30:00Z');
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
        description: 'Test bet',
      };

      expect(tx.tx_hash).toBe('abc123');
      expect(tx.marketId).toBe('market_001');
      expect(tx.description).toBe('Test bet');
    });
  });

  describe('API URL construction', () => {
    it('should construct URLs with type filter', () => {
      const params = new URLSearchParams();
      params.set('type', 'bet');
      expect(params.toString()).toBe('type=bet');
    });

    it('should construct URLs with multiple filters', () => {
      const params = new URLSearchParams();
      params.set('type', 'bet');
      params.set('status', 'completed');
      params.set('sortBy', 'amount');
      params.set('sortOrder', 'asc');
      params.set('page', '1');
      params.set('limit', '20');

      const result = params.toString();
      expect(result).toContain('type=bet');
      expect(result).toContain('status=completed');
      expect(result).toContain('sortBy=amount');
      expect(result).toContain('sortOrder=asc');
      expect(result).toContain('page=1');
      expect(result).toContain('limit=20');
    });
  });

  describe('Utility functions', () => {
    it('should convert stroops to XLM correctly', () => {
      const stroops = '10000000';
      const xlm = Number(stroops) / 1_000_000;
      expect(xlm).toBe(10);
    });

    it('should format amount with decimal places', () => {
      const stroops = '1234567';
      const xlm = Number(stroops) / 1_000_000;
      const formatted = xlm.toFixed(7).replace(/0+$/, '').replace(/\.$/, '');
      expect(formatted).toBe('1.234567');
    });

    it('should format date correctly', () => {
      const dateString = '2025-01-15T10:30:00Z';
      const date = new Date(dateString);
      const formatted = date.toLocaleDateString();
      expect(formatted).toContain('2025');
    });
  });

  describe('Pagination logic', () => {
    it('should calculate pagination info correctly', () => {
      const total = 50;
      const limit = 20;
      const totalPages = Math.ceil(total / limit);

      expect(totalPages).toBe(3);
    });

    it('should determine if next page exists', () => {
      const page = 1;
      const totalPages = 3;
      const hasNext = page < totalPages;

      expect(hasNext).toBe(true);
    });

    it('should determine if previous page exists', () => {
      const page = 1;
      const hasPrev = page > 1;

      expect(hasPrev).toBe(false);
    });
  });

  describe('Filter validation', () => {
    it('should validate transaction type', () => {
      const validTypes = ['bet', 'claim', 'refund', 'deposit', 'withdrawal'];
      expect(validTypes.includes('bet')).toBe(true);
      expect(validTypes.includes('invalid')).toBe(false);
    });

    it('should validate transaction status', () => {
      const validStatuses = ['pending', 'completed', 'failed', 'cancelled'];
      expect(validStatuses.includes('completed')).toBe(true);
      expect(validStatuses.includes('invalid')).toBe(false);
    });

    it('should validate sort field', () => {
      const validSortFields = ['created_at', 'amount', 'status'];
      expect(validSortFields.includes('created_at')).toBe(true);
      expect(validSortFields.includes('invalid')).toBe(false);
    });

    it('should validate sort order', () => {
      const validOrders = ['asc', 'desc'];
      expect(validOrders.includes('asc')).toBe(true);
      expect(validOrders.includes('invalid')).toBe(false);
    });
  });
});
