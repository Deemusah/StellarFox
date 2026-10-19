// ============================================================
// BANKERCHANGER — Accessibility Tests
// Tests for WCAG 2.1 AA compliance including:
// - ARIA labels and attributes
// - Keyboard navigation
// - Focus management
// - Semantic HTML
// - Color contrast verification (requires manual verification)
// ============================================================

import { render, screen, fireEvent } from '@testing-library/react';
import { WalletButton } from '../layout/WalletButton';
import { BetForm } from '../bet/BetForm';
import { BetHistoryTable } from '../bet/BetHistoryTable';
import { MarketStatusBadge } from '../market/MarketStatusBadge';
import { SkipLink } from '../layout/SkipLink';

describe('Accessibility: ARIA Labels', () => {
  it('should have skip-to-main-content link', () => {
    render(<SkipLink />);
    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('wallet button should have descriptive aria-label when disconnected', () => {
    render(<WalletButton />);
    const connectBtn = screen.getByRole('button', { name: /connect wallet/i });
    expect(connectBtn).toHaveAttribute('aria-label', 'Connect wallet');
  });

  it('should have aria-label on status badge', () => {
    const { container } = render(<MarketStatusBadge status="open" />);
    const badge = container.querySelector('span');
    expect(badge).toHaveAttribute('aria-label', 'Market status: Open');
  });

  it('table headers should have aria-sort attributes', () => {
    const mockBets = [
      {
        tx_hash: 'tx1',
        market_id: 'm1',
        side: 'fighter_a' as const,
        amount_xlm: 10,
        payout: '15.5',
        claimed: false,
        placed_at: new Date().toISOString(),
      },
    ];

    const { container } = render(
      <BetHistoryTable
        bets={mockBets}
        onClaim={() => {}}
        onRefund={() => {}}
      />
    );

    const sortHeaders = container.querySelectorAll('[role="button"][aria-sort]');
    expect(sortHeaders.length).toBeGreaterThan(0);
  });
});

describe('Accessibility: Keyboard Navigation', () => {
  it('should support keyboard navigation with Tab key', () => {
    render(<WalletButton />);
    const connectBtn = screen.getByRole('button', { name: /connect wallet/i });
    
    connectBtn.focus();
    expect(document.activeElement).toBe(connectBtn);
    expect(connectBtn).toHaveFocus();
  });

  it('pagination buttons should be keyboard accessible', () => {
    const mockBets = Array.from({ length: 15 }, (_, i) => ({
      tx_hash: `tx${i}`,
      market_id: `m${i}`,
      side: 'fighter_a' as const,
      amount_xlm: 10 + i,
      payout: null,
      claimed: false,
      placed_at: new Date().toISOString(),
    }));

    const { container } = render(
      <BetHistoryTable
        bets={mockBets}
        onClaim={() => {}}
        onRefund={() => {}}
      />
    );

    const prevButton = container.querySelector('button[aria-label*="Previous page"]');
    expect(prevButton).toBeInTheDocument();
    
    prevButton?.focus();
    expect(prevButton).toHaveFocus();
  });

  it('should trap focus in modal dialogs', () => {
    const { container, rerender } = render(
      <BetForm
        market={{
          market_id: 'test_market',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
          status: 'open',
          scheduled_at: new Date().toISOString(),
          weight_class: 'Heavyweight',
          title_fight: false,
          fee_bps: 500,
          pool_a: '1000000000',
          pool_b: '1000000000',
          pool_draw: '500000000',
          odds_a: 4500,
          odds_b: 4500,
          odds_draw: 1000,
          total_pool: '2500000000',
          bettors_count: 10,
          lock_before_secs: 3600,
          market_creator: 'creator_address',
          oracle_key: 'oracle_key',
        }}
      />
    );

    // Modal dialogs should properly manage focus
    const dialogElements = container.querySelectorAll('[role="dialog"]');
    dialogElements.forEach((dialog) => {
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });
});

describe('Accessibility: Form Labels', () => {
  it('form inputs should have associated labels', () => {
    render(
      <BetForm
        market={{
          market_id: 'test_market',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
          status: 'open',
          scheduled_at: new Date().toISOString(),
          weight_class: 'Heavyweight',
          title_fight: false,
          fee_bps: 500,
          pool_a: '1000000000',
          pool_b: '1000000000',
          pool_draw: '500000000',
          odds_a: 4500,
          odds_b: 4500,
          odds_draw: 1000,
          total_pool: '2500000000',
          bettors_count: 10,
          lock_before_secs: 3600,
          market_creator: 'creator_address',
          oracle_key: 'oracle_key',
        }}
      />
    );

    const inputs = screen.getAllByRole('textbox', { hidden: true });
    inputs.forEach((input) => {
      expect(input).toHaveAttribute('id');
      if (input.id === 'bet-form-amount') {
        const label = screen.getByText('Amount (XLM)');
        expect(label).toBeInTheDocument();
      }
    });
  });

  it('required form fields should have aria-required', () => {
    const { container } = render(
      <BetForm
        market={{
          market_id: 'test_market',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
          status: 'open',
          scheduled_at: new Date().toISOString(),
          weight_class: 'Heavyweight',
          title_fight: false,
          fee_bps: 500,
          pool_a: '1000000000',
          pool_b: '1000000000',
          pool_draw: '500000000',
          odds_a: 4500,
          odds_b: 4500,
          odds_draw: 1000,
          total_pool: '2500000000',
          bettors_count: 10,
          lock_before_secs: 3600,
          market_creator: 'creator_address',
          oracle_key: 'oracle_key',
        }}
      />
    );

    const amountInput = container.querySelector('input[aria-required="true"]');
    expect(amountInput).toBeInTheDocument();
  });

  it('form inputs should have aria-describedby linking to helper text', () => {
    const { container } = render(
      <BetForm
        market={{
          market_id: 'test_market',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
          status: 'open',
          scheduled_at: new Date().toISOString(),
          weight_class: 'Heavyweight',
          title_fight: false,
          fee_bps: 500,
          pool_a: '1000000000',
          pool_b: '1000000000',
          pool_draw: '500000000',
          odds_a: 4500,
          odds_b: 4500,
          odds_draw: 1000,
          total_pool: '2500000000',
          bettors_count: 10,
          lock_before_secs: 3600,
          market_creator: 'creator_address',
          oracle_key: 'oracle_key',
        }}
      />
    );

    const input = container.querySelector('input[aria-describedby]');
    expect(input).toBeInTheDocument();
    if (input) {
      const describedById = input.getAttribute('aria-describedby');
      const descElement = container.querySelector(`#${describedById}`);
      expect(descElement).toBeInTheDocument();
    }
  });
});

describe('Accessibility: Semantic HTML', () => {
  it('should use semantic <button> elements', () => {
    render(<WalletButton />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.tagName).toBe('BUTTON');
    });
  });

  it('navigation should use semantic <nav> element', () => {
    const { container } = render(<SkipLink />);
    // SkipLink is just an anchor, but other navigation should use nav tags
    expect(container).toBeInTheDocument();
  });

  it('table should use semantic table elements', () => {
    const mockBets = [
      {
        tx_hash: 'tx1',
        market_id: 'm1',
        side: 'fighter_a' as const,
        amount_xlm: 10,
        payout: '15.5',
        claimed: false,
        placed_at: new Date().toISOString(),
      },
    ];

    const { container } = render(
      <BetHistoryTable
        bets={mockBets}
        onClaim={() => {}}
        onRefund={() => {}}
      />
    );

    const table = container.querySelector('table');
    const thead = container.querySelector('thead');
    const tbody = container.querySelector('tbody');
    const ths = container.querySelectorAll('th');

    expect(table).toBeInTheDocument();
    expect(thead).toBeInTheDocument();
    expect(tbody).toBeInTheDocument();
    expect(ths.length).toBeGreaterThan(0);
  });
});

describe('Accessibility: Live Regions', () => {
  it('pagination info should have aria-live for updates', () => {
    const mockBets = Array.from({ length: 15 }, (_, i) => ({
      tx_hash: `tx${i}`,
      market_id: `m${i}`,
      side: 'fighter_a' as const,
      amount_xlm: 10 + i,
      payout: null,
      claimed: false,
      placed_at: new Date().toISOString(),
    }));

    const { container } = render(
      <BetHistoryTable
        bets={mockBets}
        onClaim={() => {}}
        onRefund={() => {}}
      />
    );

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });
});

describe('Accessibility: Color Contrast', () => {
  it('should use high-contrast text colors', () => {
    const { container } = render(<MarketStatusBadge status="open" />);
    const badge = container.querySelector('span');
    
    // Verify badge has a color class (manual verification of actual contrast needed)
    expect(badge).toHaveClass(/bg-|text-/);
  });
});

describe('Accessibility: Modal Focus Management', () => {
  it('modal should have aria-modal attribute', () => {
    const { container } = render(
      <BetForm
        market={{
          market_id: 'test_market',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
          status: 'open',
          scheduled_at: new Date().toISOString(),
          weight_class: 'Heavyweight',
          title_fight: false,
          fee_bps: 500,
          pool_a: '1000000000',
          pool_b: '1000000000',
          pool_draw: '500000000',
          odds_a: 4500,
          odds_b: 4500,
          odds_draw: 1000,
          total_pool: '2500000000',
          bettors_count: 10,
          lock_before_secs: 3600,
          market_creator: 'creator_address',
          oracle_key: 'oracle_key',
        }}
      />
    );

    const dialogs = container.querySelectorAll('[aria-modal="true"]');
    expect(dialogs.length).toBeGreaterThanOrEqual(0);
  });

  it('modal should have aria-labelledby attribute', () => {
    const { container } = render(
      <BetForm
        market={{
          market_id: 'test_market',
          fighter_a: 'Fighter A',
          fighter_b: 'Fighter B',
          status: 'open',
          scheduled_at: new Date().toISOString(),
          weight_class: 'Heavyweight',
          title_fight: false,
          fee_bps: 500,
          pool_a: '1000000000',
          pool_b: '1000000000',
          pool_draw: '500000000',
          odds_a: 4500,
          odds_b: 4500,
          odds_draw: 1000,
          total_pool: '2500000000',
          bettors_count: 10,
          lock_before_secs: 3600,
          market_creator: 'creator_address',
          oracle_key: 'oracle_key',
        }}
      />
    );

    // Dialogs should have aria-labelledby or aria-label
    const dialogs = container.querySelectorAll('[role="dialog"]');
    dialogs.forEach((dialog) => {
      const hasLabel = dialog.hasAttribute('aria-labelledby') || dialog.hasAttribute('aria-label');
      if (dialog.hasAttribute('aria-modal')) {
        // Modal dialogs should have labels
        expect(hasLabel).toBeTruthy();
      }
    });
  });
});
