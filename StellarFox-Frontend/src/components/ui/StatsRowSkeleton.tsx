export function StatsRowSkeleton(): JSX.Element {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-gray-900 rounded-xl p-4 text-center space-y-2">
          <div className="h-3 w-16 bg-gray-700 rounded mx-auto" />
          <div className="h-5 w-20 bg-gray-700 rounded mx-auto" />
        </div>
      ))}
    </div>
  );
}
