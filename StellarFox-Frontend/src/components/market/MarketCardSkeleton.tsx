export function MarketCardSkeleton(): JSX.Element {
  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-3 animate-pulse">
      {/* Fighter names row */}
      <div className="flex items-center justify-between gap-2">
        <div className="h-4 w-24 bg-gray-700 rounded" />
        <div className="h-3 w-4 bg-gray-800 rounded" />
        <div className="h-4 w-24 bg-gray-700 rounded" />
      </div>
      {/* Badges */}
      <div className="flex gap-2">
        <div className="h-5 w-12 bg-gray-700 rounded-full" />
        <div className="h-5 w-20 bg-gray-700 rounded-full" />
      </div>
      {/* Odds bar */}
      <div className="h-8 w-full bg-gray-700 rounded" />
      {/* Footer */}
      <div className="flex justify-between">
        <div className="h-3 w-24 bg-gray-700 rounded" />
        <div className="h-3 w-20 bg-gray-700 rounded" />
      </div>
    </div>
  );
}
