/**
 * Unit tests for MarketSearchAutocomplete component.
 *
 * Covers:
 * - Renders input with correct ARIA attributes
 * - Suggestions appear and update as the user types
 * - Selecting a suggestion commits the value
 * - Keyboard navigation (ArrowDown/Up, Enter, Escape)
 * - Accessibility: role=combobox, role=listbox, aria-expanded
 * - onCommit callback fired on selection and on Enter without suggestion
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketSearchAutocomplete } from '../../components/market/MarketSearchAutocomplete';

// ---------------------------------------------------------------------------
// Stub out the hook to keep component tests focused on UI behaviour
// ---------------------------------------------------------------------------
const mockClearSuggestions = jest.fn();
const mockSuggestions = [
  { name: 'Fighter A', market_id: 'market-1', side: 'a' as const },
  { name: 'Fighter B', market_id: 'market-1', side: 'b' as const },
];

let stubbedIsLoading = false;
let stubbedSuggestions = mockSuggestions;

jest.mock('../../hooks/useMarketAutocomplete', () => ({
  useMarketAutocomplete: () => ({
    suggestions: stubbedSuggestions,
    isLoading: stubbedIsLoading,
    error: null,
    clearSuggestions: mockClearSuggestions,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderAutocomplete(props: Partial<React.ComponentProps<typeof MarketSearchAutocomplete>> = {}) {
  const onCommit = jest.fn();
  const utils = render(
    <MarketSearchAutocomplete
      value=""
      onCommit={onCommit}
      {...props}
    />,
  );
  return { ...utils, onCommit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarketSearchAutocomplete', () => {
  beforeEach(() => {
    stubbedSuggestions = mockSuggestions;
    stubbedIsLoading = false;
    mockClearSuggestions.mockClear();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders a search input', () => {
      renderAutocomplete();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders with default placeholder', () => {
      renderAutocomplete();
      expect(screen.getByPlaceholderText('Search fighters…')).toBeInTheDocument();
    });

    it('renders with a custom placeholder', () => {
      renderAutocomplete({ placeholder: 'Find a boxer…' });
      expect(screen.getByPlaceholderText('Find a boxer…')).toBeInTheDocument();
    });

    it('input has role=combobox', () => {
      renderAutocomplete();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('input is aria-expanded=false when no suggestions shown yet (empty value)', () => {
      stubbedSuggestions = [];
      renderAutocomplete({ value: '' });
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    });
  });

  // ── Suggestion dropdown ───────────────────────────────────────────────────

  describe('Suggestion dropdown', () => {
    it('shows a listbox when suggestions are available', () => {
      renderAutocomplete({ value: 'Fight' });
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('renders one option per suggestion', () => {
      renderAutocomplete({ value: 'Fight' });
      expect(screen.getAllByRole('option')).toHaveLength(mockSuggestions.length);
    });

    it('renders suggestion names as option text', () => {
      renderAutocomplete({ value: 'Fight' });
      expect(screen.getByText('Fighter A')).toBeInTheDocument();
      expect(screen.getByText('Fighter B')).toBeInTheDocument();
    });

    it('input is aria-expanded=true when dropdown is open', () => {
      renderAutocomplete({ value: 'Fight' });
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    });

    it('hides the dropdown when suggestions are empty', () => {
      stubbedSuggestions = [];
      renderAutocomplete({ value: 'xyz_no_match' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  // ── Committing by clicking a suggestion ──────────────────────────────────

  describe('Selecting a suggestion', () => {
    it('calls onCommit with the suggestion name when clicked', () => {
      const { onCommit } = renderAutocomplete({ value: 'Fight' });
      fireEvent.click(screen.getByText('Fighter A'));
      expect(onCommit).toHaveBeenCalledWith('Fighter A');
    });

    it('closes the dropdown after selection', () => {
      renderAutocomplete({ value: 'Fight' });
      fireEvent.click(screen.getByText('Fighter A'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('calls clearSuggestions after selection', () => {
      renderAutocomplete({ value: 'Fight' });
      fireEvent.click(screen.getByText('Fighter A'));
      expect(mockClearSuggestions).toHaveBeenCalled();
    });
  });

  // ── Keyboard navigation ──────────────────────────────────────────────────

  describe('Keyboard navigation', () => {
    it('ArrowDown moves active index to first suggestion', () => {
      renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      // The first option should be aria-selected=true
      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowDown + ArrowDown moves to second suggestion', () => {
      renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const options = screen.getAllByRole('option');
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });

    it('ArrowDown followed by ArrowUp returns to no selection', () => {
      renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      const options = screen.getAllByRole('option');
      options.forEach((opt) => expect(opt).toHaveAttribute('aria-selected', 'false'));
    });

    it('Enter with active suggestion commits it', () => {
      const { onCommit } = renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCommit).toHaveBeenCalledWith('Fighter A');
    });

    it('Enter without active suggestion commits the current draft', () => {
      stubbedSuggestions = [];
      const { onCommit } = renderAutocomplete({ value: '' });
      const input = screen.getByRole('combobox');
      // Type something
      fireEvent.change(input, { target: { value: 'myquery' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onCommit).toHaveBeenCalledWith('myquery');
    });

    it('Escape closes the dropdown without committing', () => {
      const { onCommit } = renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('Escape calls clearSuggestions', () => {
      renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(mockClearSuggestions).toHaveBeenCalled();
    });
  });

  // ── Loading indicator ────────────────────────────────────────────────────

  describe('Loading indicator', () => {
    it('shows a loading spinner when isLoading is true', () => {
      stubbedIsLoading = true;
      renderAutocomplete({ value: 'Fight' });
      expect(screen.getByLabelText('Loading suggestions')).toBeInTheDocument();
    });

    it('hides the loading spinner when isLoading is false', () => {
      stubbedIsLoading = false;
      renderAutocomplete({ value: 'Fight' });
      expect(screen.queryByLabelText('Loading suggestions')).not.toBeInTheDocument();
    });
  });

  // ── Value sync with parent ───────────────────────────────────────────────

  describe('Controlled value', () => {
    it('reflects the value prop in the input', () => {
      renderAutocomplete({ value: 'Ali' });
      expect(screen.getByRole('combobox')).toHaveValue('Ali');
    });

    it('calls onCommit with empty string when input is cleared', () => {
      const { onCommit } = renderAutocomplete({ value: 'Fight' });
      const input = screen.getByRole('combobox');
      fireEvent.change(input, { target: { value: '' } });
      expect(onCommit).toHaveBeenCalledWith('');
    });
  });
});
