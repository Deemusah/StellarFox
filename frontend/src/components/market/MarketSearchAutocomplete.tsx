'use client';

// ============================================================
// BANKERCHANGER — MarketSearchAutocomplete Component
// Fighter-name search input with dropdown suggestions.
// ============================================================

import { useRef, useState, useId, useCallback, useEffect } from 'react';
import type { MarketSuggestion } from '../../services/api';
import { useMarketAutocomplete } from '../../hooks/useMarketAutocomplete';

export interface MarketSearchAutocompleteProps {
  /** Current committed search value (controlled) */
  value: string;
  /** Called when the user commits a value (types and pauses, or selects a suggestion) */
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Search input with a keyboard-navigable suggestions dropdown.
 *
 * Behaviour:
 * - Typing updates local input state immediately.
 * - The hook debounces the API call at 300 ms.
 * - Clicking or pressing Enter/Space on a suggestion commits it.
 * - Pressing Escape clears suggestions without committing.
 * - Clicking outside the component closes the dropdown.
 * - Arrow keys move focus through the list; Enter/Space select.
 * - Screen-reader accessible via combobox ARIA pattern.
 */
export function MarketSearchAutocomplete({
  value,
  onCommit,
  placeholder = 'Search fighters…',
  className = '',
}: Readonly<MarketSearchAutocompleteProps>): JSX.Element {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local draft — tracks what's currently typed before the user commits
  const [draft, setDraft] = useState(value);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  // Keep draft in sync if parent resets value (e.g. URL param changes)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const { suggestions, isLoading, clearSuggestions } = useMarketAutocomplete(draft);

  // Open dropdown when we have suggestions
  useEffect(() => {
    setIsOpen(suggestions.length > 0);
    setActiveIndex(-1);
  }, [suggestions]);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const commit = useCallback(
    (val: string) => {
      setDraft(val);
      clearSuggestions();
      setIsOpen(false);
      setActiveIndex(-1);
      onCommit(val);
    },
    [onCommit, clearSuggestions],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraft(val);
    // Propagate empty string immediately so the full list re-appears
    if (val === '') onCommit('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'Enter') {
        commit(draft);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          commit(suggestions[activeIndex].name);
        } else {
          commit(draft);
        }
        break;
      case 'Escape':
        e.preventDefault();
        clearSuggestions();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const handleSuggestionSelect = (suggestion: MarketSuggestion) => {
    commit(suggestion.name);
    inputRef.current?.focus();
  };

  const activeSuggestionId =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* ── Input ─────────────────────────────────────────── */}
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search fighters"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={activeSuggestionId}
        value={draft}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="min-h-[44px] w-48 bg-gray-800 text-white text-sm rounded-lg px-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        autoComplete="off"
      />

      {/* ── Loading indicator ─────────────────────────────── */}
      {isLoading && (
        <span
          aria-live="polite"
          aria-label="Loading suggestions"
          className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"
        />
      )}

      {/* ── Suggestions dropdown ───────────────────────────── */}
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Fighter suggestions"
          className="absolute z-50 mt-1 w-full min-w-[12rem] bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.market_id}-${suggestion.side}`}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onPointerDown={(e) => {
                // Prevent blur on the input before click fires
                e.preventDefault();
              }}
              onClick={() => handleSuggestionSelect(suggestion)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                index === activeIndex
                  ? 'bg-amber-500 text-black'
                  : 'text-white hover:bg-gray-700'
              }`}
            >
              {suggestion.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
