// ============================================================
// BANKERCHANGER — Home Page (/)
// Lists all boxing markets with filters, sorting, and pagination.
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMarkets } from '../hooks/useMarkets';
import { useDashboardShortcuts } from '../hooks/useDashboardShortcuts';
import { MarketCard } from '../components/market/MarketCard';
import { MarketCardSkeleton } from '../components/market/MarketCardSkeleton';
import { StatsBanner } from '../components/ui/StatsBanner';
import { MarketFilters } from '../components/market/MarketFilters';
import { downloadMarketData, fetchAllMarkets } from '../utils/marketExport';

const LIMIT = 12;

export default function HomePage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weightClass = searchParams.get('weight_class') ?? 'All Weight Classes';
  const status = searchParams.get('status') ?? 'All';
  const sort = searchParams.get('sort') ?? 'date_desc';
  const search = searchParams.get('search') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  useDashboardShortcuts({ onHelp: openHelp, onCloseHelp: closeHelp });

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
      weight_class: weightClass === 'All Weight Classes' ? undefined : weightClass,
      status: status === 'All' ? undefined : status.toLowerCase(),
      search: search || undefined,
      sort: sort as 'date_asc' | 'date_desc' | 'pool_desc',
    },
    { page, limit: LIMIT },
  );

  const totalPages = Math.ceil(total / LIMIT);
  const showSkeleton = isLoading && markets.length === 0;

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true);
    setExportError(null);
    try {
      const allMarkets = await fetchAllMarkets({
        weight_class: weightClass === 'All Weight Classes' ? undefined : weightClass,
        status: status === 'All' ? undefined : status.toLowerCase(),
        search: search || undefined,
        sort: sort as 'date_asc' | 'date_desc' | 'pool_desc',
      });
      downloadMarketData(allMarkets, format);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to export markets.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">BANKERCHANGER</h1>
            <p className="text-gray-400 text-sm mt-1">Decentralized boxing prediction markets on Stellar</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void handleExport('csv')} disabled={exporting} className="rounded bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button type="button" onClick={() => void handleExport('json')} disabled={exporting} className="rounded bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
              Export JSON
            </button>
            <button type="button" onClick={openHelp} aria-label="Show keyboard shortcuts" className="rounded bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700">
              Shortcuts (?)
            </button>
          </div>
        </div>
      </div>

      {/* Stats Banner */}
      <StatsBanner />

      {/* Filter bar */}
      <MarketFilters
        weightClass={weightClass}
        status={status}
        sort={sort}
        search={search}
        onWeightClassChange={(value) =>
          setParam('weight_class', value === 'All Weight Classes' ? null : value)
        }
        onStatusChange={(value) => setParam('status', value === 'All' ? null : value.toLowerCase())}
        onSortChange={(value) => setParam('sort', value)}
        onSearchChange={(value) => setParam('search', value || null)}
      />

      {exportError && <p role="alert" className="text-red-400 text-sm">Export failed: {exportError}</p>}

      {/* Error banner */}
      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-4 py-2">
          Failed to load markets: {error.message}
        </p>
      )}

      {/* Market grid */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <p className="text-gray-500 text-center py-16">
          No markets found. Try changing your filters.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((m) => (
            <MarketCard key={m.market_id} market={m} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button
            disabled={page <= 1}
            onClick={() => setParam('page', String(page - 1))}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white disabled:opacity-40 hover:bg-gray-700 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-gray-400 text-sm">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setParam('page', String(page + 1))}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 text-white disabled:opacity-40 hover:bg-gray-700 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeHelp();
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className="w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6 text-white shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="shortcuts-title" className="text-lg font-bold">Keyboard shortcuts</h2>
              <button type="button" onClick={closeHelp} aria-label="Close shortcuts" className="rounded px-2 py-1 text-gray-400 hover:bg-gray-800 hover:text-white">Close</button>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-6"><dt className="text-gray-300">Focus search</dt><dd><kbd>/</kbd></dd></div>
              <div className="flex justify-between gap-6"><dt className="text-gray-300">Focus status filters</dt><dd><kbd>F</kbd></dd></div>
              <div className="flex justify-between gap-6"><dt className="text-gray-300">Show shortcuts</dt><dd><kbd>?</kbd></dd></div>
              <div className="flex justify-between gap-6"><dt className="text-gray-300">Close dialog</dt><dd><kbd>Esc</kbd></dd></div>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}
