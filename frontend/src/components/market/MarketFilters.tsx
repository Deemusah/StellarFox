'use client';

import { useEffect, useRef, useState } from 'react';

const WEIGHT_CLASSES = [
  '',
  'Heavyweight',
  'Light Heavyweight',
  'Super Middleweight',
  'Middleweight',
  'Super Welterweight',
  'Welterweight',
  'Super Lightweight',
  'Lightweight',
  'Super Featherweight',
  'Featherweight',
  'Super Bantamweight',
  'Bantamweight',
  'Super Flyweight',
  'Flyweight',
  'Minimumweight',
] as const;

const STATUS_TABS = [
  { label: 'All',      value: '' },
  { label: 'Open',     value: 'open' },
  { label: 'Locked',   value: 'locked' },
  { label: 'Resolved', value: 'resolved' },
] as const;

const SORT_OPTIONS = [
  { label: 'Newest',       value: 'date_desc' },
  { label: 'Ending Soon',  value: 'date_asc' },
  { label: 'Biggest Pool', value: 'pool_desc' },
];

interface MarketFiltersProps {
  weightClass: string;
  status: string;
  sort: string;
  search: string;
  onWeightClassChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}

export function MarketFilters({
  weightClass,
  status,
  sort,
  search,
  onWeightClassChange,
  onStatusChange,
  onSortChange,
  onSearchChange,
}: Readonly<MarketFiltersProps>): JSX.Element {
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(value);
    }, 300);
  };

  const handleStatusKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(statusTabsRef.current?.querySelectorAll('[role="tab"]') ?? []) as HTMLElement[];
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const direction = e.key === 'ArrowRight' ? 1 : -1;
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      tabs[nextIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      tabs[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      tabs[tabs.length - 1]?.focus();
    }
  };

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Weight class dropdown */}
      <select
        value={weightClass === 'All Weight Classes' ? '' : weightClass}
        onChange={(e) => onWeightClassChange(e.target.value)}
        aria-label="Filter by weight class"
        className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <option value="">All Weight Classes</option>
        {WEIGHT_CLASSES.filter(Boolean).map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>

      {/* Status tabs */}
      <div
        ref={statusTabsRef}
        id="market-status-filter"
        role="tablist"
        aria-label="Filter by market status"
        className="flex rounded-lg overflow-hidden border border-gray-700"
        onKeyDown={handleStatusKeyDown}
      >
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={status.toLowerCase() === (tab.value || 'all')}
            aria-label={`Filter by ${tab.label} status`}
            tabIndex={status.toLowerCase() === (tab.value || 'all') ? 0 : -1}
            onClick={() => onStatusChange(tab.label)}
            className={`px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset ${
              status.toLowerCase() === (tab.value || 'all')
                ? 'bg-amber-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fighter name search */}
      <input
        type="search"
        id="market-search"
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search fighters…"
        aria-label="Search fighters"
        className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 w-48"
      />

      {/* Sort dropdown */}
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
        aria-label="Sort markets"
        className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500 ml-auto"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
