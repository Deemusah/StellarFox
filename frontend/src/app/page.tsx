// ============================================================
// BANKERCHANGER — Home Page (/)
// Lists all boxing markets with filters, sorting, and infinite scroll.
// ============================================================

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteMarkets } from '../hooks/useInfiniteMarkets';
import { MarketCard } from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/market/MarketCardSkeleton';
import { StatsBanner } from '../components/ui/StatsBanner';
import { MarketFilters } from '../components/market/MarketFilters';
import { ScrollSentinel } from '../components/ui/ScrollSentinel';

const LIMIT = 12;

export default function HomePage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weightClass = searchParams.get('weight_class') ?? 'All Weight Classes';
  const status = searchParams.get('status') ?? 'All';
  const sort = searchParams.get('sort') ?? 'date_desc';

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const filters = {
    weight_class: weightClass === 'All Weight Classes' ? undefined : weightClass,
    status: status === 'All' ? undefined : status.toLowerCase(),
    sort: sort as 'date_asc' | 'date_desc' | 'pool_desc',
  };

  const { markets, total, isLoading, isFetchingMore, hasMore, loadMore, error, reset } =
    useInfiniteMarkets(filters, LIMIT);

  // Reset accumulated data whenever filters change so the list restarts.
  const prevFiltersRef = useRef(JSON.stringify(filters));
  useEffect(() => {
    const key = JSON.stringify(filters);
    if (key !== prevFiltersRef.current) {
      prevFiltersRef.current = key;
      reset();
    }
  });

  const showSkeleton = isLoading && markets.length === 0;

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">BANKERCHANGER</h1>
        <p className="text-gray-400 text-sm mt-1">Decentralized boxing prediction markets on Stellar</p>
      </div>

      {/* Stats Banner */}
      <StatsBanner />

      {/* Filter bar */}
      <MarketFilters
        weightClass={weightClass}
        status={status}
        sort={sort}
        onWeightClassChange={(value) =>
          setParam('weight_class', value === 'All Weight Classes' ? null : value)
        }
        onStatusChange={(value) => setParam('status', value === 'All' ? null : value.toLowerCase())}
        onSortChange={(value) => setParam('sort', value)}
      />

      {/* Error banner */}
      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-2">
          Failed to load markets: {error.message}
        </p>
      )}

      {/* Market grid */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: LIMIT }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      ) : markets.length === 0 && !isLoading ? (
        <p className="text-gray-500 text-center py-16">
          No markets found. Try changing your filters.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((m) => (
              <MarketCard key={m.market_id} market={m} />
            ))}
            {/* Skeleton cards appended while fetching more (fills the row) */}
            {isFetchingMore &&
              Array.from({ length: 3 }).map((_, i) => (
                <MarketCardSkeleton key={`skeleton-more-${i}`} />
              ))}
          </div>

          {/* Scroll sentinel — triggers loadMore and shows spinner/end message */}
          <ScrollSentinel
            onLoadMore={loadMore}
            hasMore={hasMore}
            isLoading={isFetchingMore}
            endMessage={`All ${total} markets loaded`}
          />
        </>
      )}
    </main>
  );
}
