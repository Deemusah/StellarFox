export function BetPanelSkeleton(): JSX.Element {
  return (
    <div className="rounded-xl bg-gray-900 p-6 space-y-4 animate-pulse">
      {/* Side selector — 3 buttons */}
      <div className="flex gap-2">
        <div className="flex-1 h-11 bg-gray-700 rounded-lg" />
        <div className="flex-1 h-11 bg-gray-700 rounded-lg" />
        <div className="flex-1 h-11 bg-gray-700 rounded-lg" />
      </div>
      {/* Amount input */}
      <div className="space-y-1">
        <div className="h-3 w-20 bg-gray-700 rounded" />
        <div className="h-9 w-full bg-gray-700 rounded-lg" />
        <div className="h-3 w-16 bg-gray-800 rounded" />
      </div>
      {/* Payout preview */}
      <div className="bg-gray-800 rounded-lg px-4 py-3 space-y-2">
        <div className="flex justify-between">
          <div className="h-3 w-20 bg-gray-700 rounded" />
          <div className="h-3 w-8 bg-gray-700 rounded" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-20 bg-gray-700 rounded" />
          <div className="h-3 w-16 bg-gray-700 rounded" />
        </div>
      </div>
      {/* Submit button */}
      <div className="h-11 w-full bg-gray-700 rounded-lg" />
    </div>
  );
}
