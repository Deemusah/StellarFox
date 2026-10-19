// ============================================================
// BANKERCHANGER — LoadingSpinner Component
// Accessible animated spinner for indicating async activity.
// ============================================================

interface LoadingSpinnerProps {
  /** Tailwind size class applied to the outer element, e.g. "w-6 h-6" */
  size?: string;
  /** Accessible label (hidden visually but read by screen readers) */
  label?: string;
  /** Additional Tailwind classes */
  className?: string;
}

/**
 * Animated spinning ring using a Tailwind border trick.
 * Pairs well with `aria-live="polite"` regions in parent components.
 */
export function LoadingSpinner({
  size = 'w-6 h-6',
  label = 'Loading…',
  className = '',
}: LoadingSpinnerProps): JSX.Element {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block rounded-full border-2 border-gray-600 border-t-indigo-400 animate-spin ${size} ${className}`}
    />
  );
}
