// ============================================================
// BANKERCHANGER — SkipLink Component
// Accessibility enhancement: allows keyboard users to skip
// past navigation and jump directly to main content.
// ============================================================

export function SkipLink(): JSX.Element {
  return (
    <a
      href="#main-content"
      className="absolute -top-12 left-0 z-50 bg-amber-500 text-black px-4 py-2 font-semibold rounded-br-lg focus:top-0 transition-all"
    >
      Skip to main content
    </a>
  );
}
