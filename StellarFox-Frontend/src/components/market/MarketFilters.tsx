'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export type SortOption = 'date_asc' | 'date_desc' | 'pool_desc';

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

const CATEGORY_LABELS = {
  COMBAT_SPORTS: 'Combat Sports',
  BOXING: 'Boxing',
  MMA: 'MMA',
  KICKBOXING: 'Kickboxing',
  OTHER: 'Other',
} as const;

const STATUS_TABS = [
  { label: 'All',      value: '' },
  { label: 'Open',     value: 'open' },
  { label: 'Locked',   value: 'locked' },
  { label: 'Resolved', value: 'resolved' },
] as const;

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest',       value: 'date_desc' },
  { label: 'Ending Soon',  value: 'date_asc' },
  { label: 'Biggest Pool', value: 'pool_desc' },
];

export interface MarketFilterValues {
  status: string;
  search: string;
  sort: SortOption;
  weightClass: string;
  category: string;
}

interface MarketFiltersProps {
  onChange?: (values: MarketFilterValues) => void;
}

export function MarketFilters({ onChange }: Readonly<MarketFiltersProps>): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const status     = searchParams.get('status')      ?? '';
  const sort       = (searchParams.get('sort')       ?? 'date_desc') as SortOption;
  const searchParam = searchParams.get('search')     ?? '';
  const weightClass = searchParams.get('weight_class') ?? '';
  const weightClass = searchParams.get('weightClass') ?? '';
  const category = searchParams.get('category') ?? '';

  const [searchInput, setSearchInput] = useState(searchParam);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTabsRef = useRef<HTMLDivElement>(null);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParam({ search: value || null });
    }, 300);
  };

  useEffect(() => {
    onChange?.({ status, search: searchParam, sort, weightClass, category });
  }, [status, searchParam, sort, weightClass, category, onChange]);

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
    <div className="grid grid-cols-2 items-center gap-3 sm:flex sm:flex-wrap">
      {/* Weight class dropdown */}
      <select
        value={weightClass}
        onChange={(e) => setParam({ weight_class: e.target.value || null })}
        aria-label="Filter by weight class"
        className="min-h-[44px] w-full min-w-0 rounded-lg bg-gray-800 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 sm:w-auto"
        className="min-h-[44px] bg-gray-800 text-gray-200 text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <option value="">All Weight Classes</option>
        {WEIGHT_CLASSES.filter(Boolean).map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>

      <select
        value={category}
        onChange={(e) => setParam({ category: e.target.value || null })}
        aria-label="Filter by market category"
        className="min-h-[44px] bg-gray-800 text-white text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <option value="">All Categories</option>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      {/* Status tabs */}
      <div
        ref={statusTabsRef}
        role="tablist"
        aria-label="Filter by market status"
        className="col-span-2 flex max-w-full overflow-x-auto rounded-lg border border-gray-700 sm:col-span-1"
        onKeyDown={handleStatusKeyDown}
      >
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={status === tab.value}
            aria-label={`Filter by ${tab.label} status`}
            tabIndex={status === tab.value ? 0 : -1}
            onClick={() => setParam({ status: tab.value || null })}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset ${
              status === tab.value
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
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search fighters…"
        aria-label="Search fighters"
        className="min-h-[44px] w-full min-w-0 rounded-lg bg-gray-800 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 sm:w-48"
      />

      {/* Sort dropdown */}
      <select
        value={sort}
        onChange={(e) => setParam({ sort: e.target.value })}
        aria-label="Sort markets"
        className="min-h-[44px] w-full min-w-0 rounded-lg bg-gray-800 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 sm:ml-auto sm:w-auto"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
