'use client';

// ============================================================
// BANKERCHANGER — Breadcrumb Component
// Reads the current pathname and renders a clickable trail.
// ============================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Human-readable labels for known path segments.
const SEGMENT_LABELS: Record<string, string> = {
  '':         'Home',
  markets:    'Markets',
  portfolio:  'Portfolio',
  create:     'Create Market',
  payer:      'Payer',
  governance: 'Governance',
  new:        'New',
};

interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * Builds an ordered list of breadcrumb items from a pathname string.
 *
 * e.g. "/markets/mkt-42" → [
 *   { label: "Home",    href: "/" },
 *   { label: "Markets", href: "/markets" },
 *   { label: "mkt-42",  href: "/markets/mkt-42" },
 * ]
 */
export function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean); // drop empty strings

  // Always start at Home
  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;
    const label = SEGMENT_LABELS[segment] ?? segment; // fall back to raw segment
    crumbs.push({ label, href: accumulated });
  }

  return crumbs;
}

/**
 * Breadcrumb navigation bar.
 * Hidden on the root "/" route since there's nothing to navigate back to.
 */
export function Breadcrumb(): JSX.Element | null {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  // Nothing to show on the home page
  if (crumbs.length <= 1) return null;

  const lastIndex = crumbs.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className="max-w-6xl mx-auto px-4 py-2"
    >
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
        {crumbs.map((crumb, index) => {
          const isLast = index === lastIndex;

          return (
            <li key={crumb.href} className="flex items-center gap-1">
              {/* Separator — skip before the first item */}
              {index > 0 && (
                <span aria-hidden="true" className="select-none">
                  /
                </span>
              )}

              {isLast ? (
                // Current page — not a link, aria-current for assistive tech
                <span
                  aria-current="page"
                  className="text-gray-900 dark:text-white font-medium truncate max-w-[160px]"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-amber-500 dark:hover:text-amber-400 transition-colors truncate max-w-[160px]"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
