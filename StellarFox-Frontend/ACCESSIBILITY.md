# Accessibility Improvements — WCAG 2.1 AA Compliance

## Overview

This document outlines the accessibility improvements made to the StellarFox platform to achieve WCAG 2.1 Level AA compliance, ensuring the site is usable by people with disabilities including those using assistive technologies like screen readers, keyboard navigation, and magnification tools.

## Completed Improvements

### 1. Color Contrast (WCAG 2.1 Criterion 1.4.3)

**Changes Made:**
- Updated `text-gray-500` to `text-gray-400` in various components for improved contrast
- Updated `text-gray-400` to `text-gray-300` where used on `bg-gray-800` backgrounds
- Ensured all text meets minimum 4.5:1 contrast ratio (AA standard)

**Files Modified:**
- `src/components/bet/BetPanel.tsx` — Payout preview text contrast
- `src/components/bet/BetForm.tsx` — Form labels and payout display
- `src/components/market/MarketFilters.tsx` — Filter dropdown text color
- `src/components/bet/BetHistoryTable.tsx` — Table header text color

**Testing:**
Run contrast tests with any WCAG contrast checker:
```bash
npm run lint  # ESLint checks for potential issues
```

### 2. ARIA Labels and Attributes (WCAG 2.1 Criterion 4.1.3)

**Added ARIA Enhancements:**

#### Form Inputs
- Added `aria-required="true"` to required form fields
- Added `aria-describedby` linking inputs to helper text or error messages
- Added `aria-invalid` for form validation states
- Associated all inputs with explicit labels using `htmlFor` and `id`

**Example:**
```tsx
<input
  id="bet-amount"
  type="number"
  aria-required="true"
  aria-describedby="amount-hint"
  aria-invalid={!isValid}
/>
<label htmlFor="bet-amount">Amount (XLM)</label>
<p id="amount-hint">Min: 1 XLM</p>
```

#### Table Headers
- Added `aria-sort` attributes to sortable column headers
- Added `role="button"` and keyboard handlers to sortable headers
- Added `aria-label` to pagination buttons with context about current page

**Example:**
```tsx
<th
  aria-sort={sortKey === 'amount' ? 'ascending' : 'none'}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') handleSort('amount');
  }}
>
  Amount
</th>
```

#### Modal Dialogs
- All modals have `role="dialog"` and `aria-modal="true"`
- Modals use `aria-labelledby` pointing to the dialog title
- Focus management implemented with focus trap on Tab key

**Example:**
```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
>
  <h2 id="dialog-title">Confirm your bet</h2>
  {/* content */}
</div>
```

#### Live Regions
- Transaction status updates use `role="status"` with `aria-live="polite"` and `aria-atomic="true"`
- Pagination updates announce via `aria-live="polite"`

**Files Modified:**
- `src/components/bet/BetPanel.tsx` — Form input labels
- `src/components/bet/BetForm.tsx` — Form input aria attributes
- `src/components/bet/BetHistoryTable.tsx` — Table headers and pagination
- `src/components/ui/TransactionStatus.tsx` — Live region announcements

### 3. Keyboard Navigation (WCAG 2.1 Criterion 2.1.1, 2.4.3)

**Improvements:**

#### Skip Links
- Added `SkipLink` component that appears on focus
- Allows keyboard users to skip past navigation to main content
- Link targets `main#main-content`

**Implementation:**
```tsx
<a href="#main-content" className="focus:top-0 -top-12">
  Skip to main content
</a>
```

#### Focus Management
- All interactive elements are keyboard accessible
- Focus indicators visible with `focus:ring-2 focus:ring-amber-500`
- Tab order follows logical reading order
- Modal dialogs implement focus trap (Tab/Shift+Tab)

#### Keyboard Event Handlers
- Sortable table headers respond to Enter and Space keys
- Modal dialogs close on Escape key
- Tab list navigation supports Arrow keys, Home, and End keys

**Example from MarketFilters:**
```tsx
const handleStatusKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    // Navigate between tabs
  } else if (e.key === 'Home' || e.key === 'End') {
    // Jump to first/last tab
  }
};
```

### 4. Semantic HTML (WCAG 2.1 Criterion 1.3.1)

**Improvements:**
- Use semantic `<header>`, `<main>`, `<nav>` elements
- All interactive elements use proper semantic tags (`<button>`, `<a>`, `<form>`)
- Table structure with `<table>`, `<thead>`, `<tbody>`, `<th>`, `<tr>`, `<td>`
- Form inputs always have associated `<label>` elements
- No divs or spans used as buttons without proper ARIA

**Files:**
- `src/app/layout.tsx` — Added `<main id="main-content">` wrapper
- All components use semantic elements throughout

### 5. Skip Links (WCAG 2.1 Criterion 2.4.1)

**New File:**
- `src/components/layout/SkipLink.tsx` — Skip-to-main-content link

**Features:**
- Hidden by default with `-top-12` positioning
- Appears on focus with `focus:top-0`
- Positioned absolutely for all screen sizes
- Uses amber color to match brand

**Usage:**
```tsx
<SkipLink />
<Header />
<main id="main-content">{children}</main>
```

## Testing Accessibility

### Unit Tests

Run accessibility-specific tests:
```bash
npm run test -- --testNamePattern="Accessibility"
```

**Test Coverage:**
- ARIA labels and attributes
- Keyboard navigation
- Form validation associations
- Semantic HTML structure
- Live regions
- Modal focus management

**Test File:** `src/components/__tests__/accessibility.test.tsx`

### End-to-End Tests

Run Playwright tests with axe-core integration:
```bash
npm run test:e2e -- e2e/accessibility.spec.ts
```

**Test Coverage:**
- WCAG 2.1 AA violations detection
- Heading hierarchy
- Color contrast ratios
- Keyboard navigation flows
- Screen reader compatibility
- Image alt text
- Form accessibility
- Focus indicators

**Test File:** `e2e/accessibility.spec.ts`

### Manual Testing Checklist

#### Keyboard Navigation
- [ ] Tab through all pages — focus order should be logical
- [ ] Escape closes modals and dropdowns
- [ ] Arrow keys navigate within tab groups and select lists
- [ ] Space/Enter activates buttons and links
- [ ] No keyboard traps

#### Screen Reader Testing
- [ ] Test with NVDA (Windows), JAWS (Windows), or VoiceOver (macOS)
- [ ] Forms announce labels and validation messages
- [ ] Status changes announced via live regions
- [ ] Links have descriptive text (not "click here")
- [ ] Button purposes clear without visual context

#### Color Contrast
- [ ] Use browser dev tools or online contrast checker
- [ ] All text passes WCAG AA 4.5:1 ratio
- [ ] Test both light and dark themes
- [ ] Focus indicators have sufficient contrast

#### Zoom/Magnification
- [ ] Page works at 200% zoom (no horizontal scroll)
- [ ] Text remains readable when magnified
- [ ] Touch targets remain at least 44x44 pixels

## Configuration & Standards

### WCAG 2.1 Level AA Criteria Met

| Criterion | Name | Status | Notes |
|-----------|------|--------|-------|
| 1.1.1 | Non-text Content | ✓ | All images have alt text or aria-hidden |
| 1.3.1 | Info and Relationships | ✓ | Proper semantic HTML and ARIA labels |
| 1.4.3 | Contrast (Minimum) | ✓ | 4.5:1 for normal text, 3:1 for large text |
| 2.1.1 | Keyboard | ✓ | All functionality keyboard accessible |
| 2.1.2 | No Keyboard Trap | ✓ | Focus can move away from all components |
| 2.4.1 | Skip Links | ✓ | Skip to main content link present |
| 2.4.3 | Focus Order | ✓ | Focus order is logical |
| 2.4.7 | Focus Visible | ✓ | Focus indicator visible on all interactive elements |
| 3.1.1 | Language of Page | ✓ | `lang="en"` on `<html>` element |
| 3.3.1 | Error Identification | ✓ | Form errors clearly indicated |
| 3.3.2 | Labels or Instructions | ✓ | All form fields have labels |
| 3.3.4 | Error Prevention | ✓ | Forms provide validation feedback |
| 4.1.2 | Name, Role, Value | ✓ | All UI components have proper ARIA |
| 4.1.3 | Status Messages | ✓ | Live regions announce status changes |

## Common Issues & Solutions

### Issue: Text color too light on dark background
**Solution:** Update color classes to higher contrast options
```tsx
// Before
<p className="text-gray-500">Text</p>

// After  
<p className="text-gray-400">Text</p>
```

### Issue: Form inputs not associated with labels
**Solution:** Use `htmlFor` and `id` attributes
```tsx
<label htmlFor="input-id">Label text</label>
<input id="input-id" />
```

### Issue: Button purposes unclear to screen readers
**Solution:** Add descriptive `aria-label`
```tsx
// Before
<button>←</button>

// After
<button aria-label="Previous page">←</button>
```

### Issue: Modal doesn't trap focus
**Solution:** Implement focus trap on Tab key
```tsx
useEffect(() => {
  if (!isOpen) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      // Trap focus within modal
    }
  };
  window.addEventListener('keydown', onKey);
}, [isOpen]);
```

## Browser Support

All accessibility features are supported in:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Tools & Resources

### Browser Extensions
- **axe DevTools** — Automated accessibility testing
- **WAVE** — Web accessibility evaluation tool
- **Lighthouse** — Google's built-in audit tool

### Automated Testing
- **axe-core** — JavaScript accessibility engine (integrated into tests)
- **Jest + React Testing Library** — Unit test accessibility features
- **Playwright** — E2E tests with accessibility checks

### Screen Readers
- **NVDA** — Free, Windows (http://www.nvaccess.org/)
- **JAWS** — Commercial, Windows (http://www.freedomscientific.com/)
- **VoiceOver** — Built-in, macOS/iOS
- **TalkBack** — Built-in, Android

### Learning Resources
- [Web Content Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM](https://webaim.org/)
- [A11ycast by Google Chrome](https://www.youtube.com/playlist?list=PLNYkxOF6rcICWx0C9Xc-RgEzwLvePngcY)

## Maintenance Guidelines

### When Adding New Components

1. **Test keyboard navigation:**
   - All interactive elements must be keyboard accessible
   - Tab order should be logical
   - No keyboard traps

2. **Add ARIA labels:**
   - Form inputs with labels or aria-label
   - Buttons with descriptive text or aria-label
   - Images with alt text or aria-hidden

3. **Check color contrast:**
   - Use axe DevTools or contrast checker
   - Ensure 4.5:1 ratio for normal text
   - Test both light and dark themes

4. **Use semantic HTML:**
   - `<button>` for buttons, not `<div>`
   - `<a>` for links, not `<button>`
   - Proper heading hierarchy
   - Form structure with labels

5. **Test with screen readers:**
   - Pages should make sense when read aloud
   - Form labels and errors announced clearly
   - Purpose of buttons/links clear without visual context

### Running Tests Before Commit

```bash
# Run all tests including accessibility
npm run test

# Run only accessibility tests
npm run test -- --testNamePattern="Accessibility"

# Run E2E accessibility tests
npm run test:e2e -- e2e/accessibility.spec.ts
```

### Automated Checks in CI/CD

Add to GitHub Actions or your CI pipeline:
```bash
npm run lint  # Catches basic issues
npm run test  # Runs accessibility unit tests
npm run test:e2e  # Runs axe-core accessibility scans
```

## Reporting Issues

If you find accessibility issues, please:

1. Test with WCAG criteria in mind
2. Document what doesn't work and why (e.g., "Can't navigate to this button with Tab key")
3. Specify assistive technology used (screen reader, keyboard only, etc.)
4. Create a GitHub issue with "accessibility" label

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN: Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [React Accessibility](https://reactjs.org/docs/accessibility.html)
- [Tailwind CSS Accessibility](https://tailwindcss.com/docs/ring-color#applying-by-default)

---

**Last Updated:** October 16, 2026
**Compliance Level:** WCAG 2.1 Level AA
**Status:** In Progress
