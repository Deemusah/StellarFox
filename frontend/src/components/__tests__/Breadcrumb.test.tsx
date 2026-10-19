/**
 * Tests for the Breadcrumb component and buildBreadcrumbs helper (layout/Breadcrumb)
 *
 * Covers:
 *  - buildBreadcrumbs produces correct items for known and unknown routes
 *  - Breadcrumb renders null on the root path
 *  - Breadcrumb renders clickable links for ancestor segments
 *  - Current page segment is not a link and has aria-current="page"
 *  - Navigation links have correct hrefs
 *  - Separator characters are rendered between items
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Breadcrumb, buildBreadcrumbs } from '../layout/Breadcrumb';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock next/link — render as a plain <a> so we can assert hrefs
jest.mock('next/link', () => {
  const Link = ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  );
  Link.displayName = 'Link';
  return Link;
});

// Mock usePathname so each test can control the current route
let mockPathname = '/';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// ── buildBreadcrumbs unit tests ───────────────────────────────────────────────

describe('buildBreadcrumbs', () => {
  it('returns only Home for the root path', () => {
    const crumbs = buildBreadcrumbs('/');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]).toEqual({ label: 'Home', href: '/' });
  });

  it('builds two items for a top-level known route', () => {
    const crumbs = buildBreadcrumbs('/portfolio');
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toEqual({ label: 'Home', href: '/' });
    expect(crumbs[1]).toEqual({ label: 'Portfolio', href: '/portfolio' });
  });

  it('builds three items for a nested route', () => {
    const crumbs = buildBreadcrumbs('/markets/mkt-42');
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toEqual({ label: 'Home',    href: '/' });
    expect(crumbs[1]).toEqual({ label: 'Markets', href: '/markets' });
    expect(crumbs[2]).toEqual({ label: 'mkt-42',  href: '/markets/mkt-42' });
  });

  it('falls back to the raw segment for unknown paths', () => {
    const crumbs = buildBreadcrumbs('/unknown-section/sub-page');
    expect(crumbs[1].label).toBe('unknown-section');
    expect(crumbs[2].label).toBe('sub-page');
  });

  it('maps known route labels correctly', () => {
    const pairs: Array<[string, string]> = [
      ['/create',     'Create Market'],
      ['/payer',      'Payer'],
      ['/governance', 'Governance'],
    ];
    for (const [path, expectedLabel] of pairs) {
      const crumbs = buildBreadcrumbs(path);
      expect(crumbs[1].label).toBe(expectedLabel);
    }
  });

  it('returns correct accumulated hrefs for a 3-level path', () => {
    const crumbs = buildBreadcrumbs('/governance/new');
    expect(crumbs[1].href).toBe('/governance');
    expect(crumbs[2].href).toBe('/governance/new');
  });
});

// ── Breadcrumb component tests ────────────────────────────────────────────────

describe('Breadcrumb component', () => {
  describe('root path', () => {
    it('renders nothing on "/"', () => {
      mockPathname = '/';
      const { container } = render(<Breadcrumb />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('top-level route — /portfolio', () => {
    beforeEach(() => {
      mockPathname = '/portfolio';
      render(<Breadcrumb />);
    });

    it('renders a nav element with aria-label="Breadcrumb"', () => {
      expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    });

    it('renders a Home link', () => {
      const homeLink = screen.getByRole('link', { name: /home/i });
      expect(homeLink).toBeInTheDocument();
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('renders the current segment as plain text, not a link', () => {
      expect(screen.queryByRole('link', { name: /portfolio/i })).toBeNull();
      expect(screen.getByText('Portfolio')).toBeInTheDocument();
    });

    it('marks the current page segment with aria-current="page"', () => {
      const current = screen.getByText('Portfolio');
      expect(current).toHaveAttribute('aria-current', 'page');
    });

    it('renders separator characters between items', () => {
      // There should be exactly one "/" separator for 2-item breadcrumbs
      const separators = screen.getAllByText('/', { exact: true });
      expect(separators).toHaveLength(1);
    });
  });

  describe('nested route — /markets/mkt-99', () => {
    beforeEach(() => {
      mockPathname = '/markets/mkt-99';
      render(<Breadcrumb />);
    });

    it('renders Home link pointing to "/"', () => {
      const homeLink = screen.getByRole('link', { name: /home/i });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('renders Markets link pointing to "/markets"', () => {
      const marketsLink = screen.getByRole('link', { name: /markets/i });
      expect(marketsLink).toBeInTheDocument();
      expect(marketsLink).toHaveAttribute('href', '/markets');
    });

    it('renders the leaf segment as the current page (not a link)', () => {
      expect(screen.queryByRole('link', { name: /mkt-99/i })).toBeNull();
      const current = screen.getByText('mkt-99');
      expect(current).toHaveAttribute('aria-current', 'page');
    });

    it('renders two separator characters for a 3-item trail', () => {
      const separators = screen.getAllByText('/', { exact: true });
      expect(separators).toHaveLength(2);
    });
  });

  describe('governance/new route', () => {
    beforeEach(() => {
      mockPathname = '/governance/new';
      render(<Breadcrumb />);
    });

    it('renders Governance link', () => {
      const govLink = screen.getByRole('link', { name: /governance/i });
      expect(govLink).toHaveAttribute('href', '/governance');
    });

    it('renders New as current page', () => {
      const current = screen.getByText('New');
      expect(current).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('accessibility', () => {
    it('breadcrumb nav has accessible name', () => {
      mockPathname = '/portfolio';
      render(<Breadcrumb />);
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    });

    it('separator slashes are hidden from assistive technology', () => {
      mockPathname = '/portfolio';
      render(<Breadcrumb />);
      const separator = screen.getByText('/');
      expect(separator).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
