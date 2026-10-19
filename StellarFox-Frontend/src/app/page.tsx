// ============================================================
// BANKERCHANGER — Home Page (/)
// Market discovery with division categories, filters, sorting, and pagination.
// Lists markets with category filters, sorting, and pagination.
// ============================================================

'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMarkets } from '../hooks/useMarkets';
import { MarketCard } from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/market/MarketCardSkeleton';
import { StatsBanner } from '../components/ui/StatsBanner';
import { MarketFilters } from '../components/market/MarketFilters';
import { MARKET_CATEGORY_FILTERS } from '../services/api';

const LIMIT = 12;
const DIVISION_CATEGORIES = [
  { label: 'All divisions', value: '' },
  { label: 'Heavyweight', value: 'Heavyweight' },
  { label: 'Middleweight', value: 'Middleweight' },
  { label: 'Welterweight', value: 'Welterweight' },
  { label: 'Lightweight', value: 'Lightweight' },
];

export default function HomePage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weightClass = searchParams.get('weight_class') ?? '';
  const status = searchParams.get('status') ?? '';
  const weightClass = searchParams.get('weight_class') ?? 'All Weight Classes';
  const categoryParam = searchParams.get('category');
  const category = MARKET_CATEGORY_FILTERS.find((value) => value === categoryParam);
  const status = searchParams.get('status') ?? 'All';
  const sort = searchParams.get('sort') ?? 'date_desc';
  const page = Number(searchParams.get('page') ?? '1');

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      // Reset to page 1 on filter/sort change
      if (key !== 'page') params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const { markets, total, isLoading, error } = useMarkets(
    {
      weight_class: weightClass || undefined,
      status: status || undefined,
      search: searchParams.get('search') || undefined,
      weight_class: weightClass === 'All Weight Classes' ? undefined : weightClass,
      category,
      status: status === 'All' ? undefined : status.toLowerCase(),
      sort: sort as 'date_asc' | 'date_desc' | 'pool_desc',
    },
    { page, limit: LIMIT },
  );

  const totalPages = Math.ceil(total / LIMIT);
  const showSkeleton = isLoading && markets.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-black text-white">BANKERCHANGER</h1>
        <p className="mt-1 text-sm text-gray-400">Decentralized boxing prediction markets on Stellar</p>
        <p className="text-gray-400 text-sm mt-1">Decentralized combat sports prediction markets on Stellar</p>
      </div>

      <StatsBanner />

      <section className="space-y-3" aria-labelledby="division-heading">
        <div>
          <p className="text-xs font-semibold uppercase text-amber-400">Discover</p>
          <h2 id="division-heading" className="text-lg font-bold text-white">Browse by division</h2>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {DIVISION_CATEGORIES.map((category) => (
            <button
              key={category.value || 'all'}
              type="button"
              aria-pressed={weightClass === category.value}
              onClick={() => setParam('weight_class', category.value || null)}
              className={`min-h-11 shrink-0 rounded-lg border px-4 text-sm font-medium transition-colors ${
                weightClass === category.value
                  ? 'border-amber-400 bg-amber-400 text-gray-950'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="markets-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Market board</p>
            <h2 id="markets-heading" className="text-xl font-bold text-white">
              {status ? `${status[0].toUpperCase()}${status.slice(1)} markets` : 'All markets'}
            </h2>
          </div>
          <p className="text-sm text-gray-400">{total.toLocaleString()} markets</p>
        </div>

        <MarketFilters />

        {error && (
          <p className="rounded-lg bg-red-900/20 px-4 py-2 text-sm text-red-400">
            Failed to load markets: {error.message}
          </p>
        )}

        {showSkeleton ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <MarketCardSkeleton key={i} />
            ))}
          </div>
        ) : markets.length === 0 ? (
          <p className="py-16 text-center text-gray-500">
            No markets found. Try changing your filters.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {markets.map((m) => (
              <MarketCard key={m.market_id} market={m} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              disabled={page <= 1}
              onClick={() => setParam('page', String(page - 1))}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-400">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setParam('page', String(page + 1))}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
