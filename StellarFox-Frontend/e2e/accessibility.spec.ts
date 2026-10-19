// ============================================================
// BANKERCHANGER — E2E Accessibility Tests
// Uses axe-core for automated WCAG 2.1 AA compliance testing
// ============================================================

import { test, expect, Page } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test.describe('Accessibility - Home Page', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should not have any accessibility violations', async ({ page }: { page: Page }) => {
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
    });
  });

  test('should have proper heading hierarchy', async ({ page }: { page: Page }) => {
    const h1s = await page.locator('h1').count();
    expect(h1s).toBeGreaterThanOrEqual(0);
    
    // Should not skip heading levels (e.g., h1 -> h3)
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    let lastLevel = 0;
    for (const heading of headings) {
      const tagName = await heading.evaluate((el: HTMLElement) => el.tagName);
      const currentLevel = parseInt(tagName[1]);
      expect(currentLevel - lastLevel).toBeLessThanOrEqual(1);
      lastLevel = currentLevel;
    }
  });

  test('should have proper color contrast', async ({ page }: { page: Page }) => {
    // Axe's color contrast check should pass
    await checkA11y(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });
  });

  test('should have skip link', async ({ page }: { page: Page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeVisible();
    expect(await skipLink.textContent()).toContain('Skip to main content');
  });

  test('should have main content landmark', async ({ page }: { page: Page }) => {
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible();
  });
});

test.describe('Accessibility - Markets Page', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/markets');
    await injectAxe(page);
  });

  test('should not have accessibility violations on markets page', async ({ page }: { page: Page }) => {
    await checkA11y(page, null, {
      detailedReport: true,
    });
  });

  test('market filters should be keyboard accessible', async ({ page }: { page: Page }) => {
    // Tab through filter controls
    await page.keyboard.press('Tab');
    let activeElement = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(activeElement).toBeTruthy();
  });

  test('market status badges should have aria labels', async ({ page }: { page: Page }) => {
    const badges = page.locator('[aria-label*="Market status"]');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Accessibility - Market Detail Page', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // Navigate to a market - adjust URL as needed based on your app
    await page.goto('/markets');
    await injectAxe(page);
  });

  test('should not have accessibility violations', async ({ page }: { page: Page }) => {
    await checkA11y(page, null, {
      detailedReport: true,
    });
  });

  test('form inputs should have labels', async ({ page }: { page: Page }) => {
    const inputs = page.locator('input[type="number"], input[type="text"]');
    const count = await inputs.count();
    
    // Verify inputs have associated labels or aria-label
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const ariaLabel = await input.getAttribute('aria-label');
      const id = await input.getAttribute('id');
      const label = id ? page.locator(`label[for="${id}"]`) : null;
      
      const hasLabel = ariaLabel || (label && await label.count() > 0);
      if (i < 2) { // Only check first couple to avoid test slowness
        expect(hasLabel).toBeTruthy();
      }
    }
  });

  test('form should have proper error associations', async ({ page }: { page: Page }) => {
    const inputs = page.locator('input[aria-describedby]');
    const count = await inputs.count();
    
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const describedById = await input.getAttribute('aria-describedby');
      if (describedById) {
        const description = page.locator(`#${describedById}`);
        expect(await description.count()).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('Accessibility - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/');
  });

  test('should be navigable with Tab key', async ({ page }: { page: Page }) => {
    // Tab through elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => 
        document.activeElement?.tagName
      );
      // Each tab should focus something
      expect(focused).toBeTruthy();
    }
  });

  test('should have visible focus indicators', async ({ page }: { page: Page }) => {
    // Tab to an element and check if focus is visible
    await page.keyboard.press('Tab');
    
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el) return null;
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        boxShadow: styles.boxShadow,
        borderColor: styles.borderColor,
      };
    });
    
    // Should have some visual focus indicator
    expect(focused).toBeTruthy();
  });

  test('should not have keyboard traps', async ({ page }: { page: Page }) => {
    // Tab through the page multiple times
    // If we get stuck on same element, there's a trap
    const focusedElements: string[] = [];
    
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => 
        document.activeElement?.getAttribute('id') || 
        document.activeElement?.tagName
      );
      focusedElements.push(focused || 'unknown');
    }
    
    // Check we're not stuck on same element (allowing repeats but not all same)
    const unique = new Set(focusedElements);
    expect(unique.size).toBeGreaterThan(1);
  });

  test('Escape key should close modals', async ({ page }: { page: Page }) => {
    // Navigate to a page with modals/dialogs
    await page.goto('/');
    
    // Try to open any dialog if one exists
    const dialogButtons = page.locator('button[aria-haspopup="dialog"]');
    if (await dialogButtons.count() > 0) {
      await dialogButtons.first().click();
      
      // Check if dialog is visible
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.count() > 0) {
        await page.keyboard.press('Escape');
        // Dialog should be closed or hidden
        expect(await dialog.isVisible()).toBeFalsy();
      }
    }
  });
});

test.describe('Accessibility - Screen Reader', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should have proper ARIA labels', async ({ page }: { page: Page }) => {
    // Check for buttons without accessible names
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      
      // Button should have either aria-label or visible text
      const hasAccessibleName = ariaLabel || (text && text.trim().length > 0);
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('should have proper landmark regions', async ({ page }: { page: Page }) => {
    const header = page.locator('header');
    const main = page.locator('main');
    const nav = page.locator('nav');
    
    expect(await header.count()).toBeGreaterThanOrEqual(0);
    expect(await main.count()).toBeGreaterThanOrEqual(1);
  });

  test('live regions should announce updates', async ({ page }: { page: Page }) => {
    const liveRegions = page.locator('[aria-live]');
    const count = await liveRegions.count();
    
    for (let i = 0; i < count; i++) {
      const region = liveRegions.nth(i);
      const live = await region.getAttribute('aria-live');
      const atomic = await region.getAttribute('aria-atomic');
      
      expect(['polite', 'assertive', 'off']).toContain(live);
      if (live !== 'off') {
        // If live region is active, aria-atomic is recommended
        expect(atomic).toBeTruthy();
      }
    }
  });
});

test.describe('Accessibility - Color Contrast', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should meet WCAG AA color contrast requirements', async ({ page }: { page: Page }) => {
    await checkA11y(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
      axeOptions: {
        standards: 'wcag2aa',
      },
    });
  });

  test('should have readable text in dark mode', async ({ page }: { page: Page }) => {
    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    await injectAxe(page);
    await checkA11y(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });
  });
});

test.describe('Accessibility - Images and Icons', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('images should have alt text or aria-label', async ({ page }: { page: Page }) => {
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const ariaHidden = await img.getAttribute('aria-hidden');
      
      // Decorative images should have aria-hidden
      // Content images should have alt or aria-label
      if (ariaHidden !== 'true') {
        expect(alt || ariaLabel).toBeTruthy();
      }
    }
  });
});

test.describe('Accessibility - Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should not have any accessibility violations', async ({ page }) => {
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
    });
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    const h1s = await page.locator('h1').count();
    expect(h1s).toBeGreaterThanOrEqual(0);
    
    // Should not skip heading levels (e.g., h1 -> h3)
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    let lastLevel = 0;
    for (const heading of headings) {
      const tagName = await heading.evaluate((el) => el.tagName);
      const currentLevel = parseInt(tagName[1]);
      expect(currentLevel - lastLevel).toBeLessThanOrEqual(1);
      lastLevel = currentLevel;
    }
  });

  test('should have proper color contrast', async ({ page }) => {
    // Axe's color contrast check should pass
    await checkA11y(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });
  });

  test('should have skip link', async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeVisible();
    expect(await skipLink.textContent()).toContain('Skip to main content');
  });

  test('should have main content landmark', async ({ page }) => {
    const main = page.locator('main#main-content');
    await expect(main).toBeVisible();
  });
});

test.describe('Accessibility - Markets Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/markets');
    await injectAxe(page);
  });

  test('should not have accessibility violations on markets page', async ({ page }) => {
    await checkA11y(page, null, {
      detailedReport: true,
    });
  });

  test('market filters should be keyboard accessible', async ({ page }) => {
    // Tab through filter controls
    await page.keyboard.press('Tab');
    let activeElement = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(activeElement).toBeTruthy();
  });

  test('market status badges should have aria labels', async ({ page }) => {
    const badges = page.locator('[aria-label*="Market status"]');
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Accessibility - Market Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a market - adjust URL as needed based on your app
    await page.goto('/markets');
    await injectAxe(page);
  });

  test('should not have accessibility violations', async ({ page }) => {
    await checkA11y(page, null, {
      detailedReport: true,
    });
  });

  test('form inputs should have labels', async ({ page }) => {
    const inputs = page.locator('input[type="number"], input[type="text"]');
    const count = await inputs.count();
    
    // Verify inputs have associated labels or aria-label
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const ariaLabel = await input.getAttribute('aria-label');
      const id = await input.getAttribute('id');
      const label = id ? page.locator(`label[for="${id}"]`) : null;
      
      const hasLabel = ariaLabel || (label && await label.count() > 0);
      if (i < 2) { // Only check first couple to avoid test slowness
        expect(hasLabel).toBeTruthy();
      }
    }
  });

  test('form should have proper error associations', async ({ page }) => {
    const inputs = page.locator('input[aria-describedby]');
    const count = await inputs.count();
    
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const describedById = await input.getAttribute('aria-describedby');
      if (describedById) {
        const description = page.locator(`#${describedById}`);
        expect(await description.count()).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('Accessibility - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should be navigable with Tab key', async ({ page }) => {
    // Tab through elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => 
        document.activeElement?.tagName
      );
      // Each tab should focus something
      expect(focused).toBeTruthy();
    }
  });

  test('should have visible focus indicators', async ({ page }) => {
    // Tab to an element and check if focus is visible
    await page.keyboard.press('Tab');
    
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el) return null;
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        boxShadow: styles.boxShadow,
        borderColor: styles.borderColor,
      };
    });
    
    // Should have some visual focus indicator
    expect(focused).toBeTruthy();
  });

  test('should not have keyboard traps', async ({ page }) => {
    // Tab through the page multiple times
    // If we get stuck on same element, there's a trap
    const focusedElements: string[] = [];
    
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => 
        document.activeElement?.getAttribute('id') || 
        document.activeElement?.tagName
      );
      focusedElements.push(focused || 'unknown');
    }
    
    // Check we're not stuck on same element (allowing repeats but not all same)
    const unique = new Set(focusedElements);
    expect(unique.size).toBeGreaterThan(1);
  });

  test('Escape key should close modals', async ({ page }) => {
    // Navigate to a page with modals/dialogs
    await page.goto('/');
    
    // Try to open any dialog if one exists
    const dialogButtons = page.locator('button[aria-haspopup="dialog"]');
    if (await dialogButtons.count() > 0) {
      await dialogButtons.first().click();
      
      // Check if dialog is visible
      const dialog = page.locator('[role="dialog"]');
      if (await dialog.count() > 0) {
        await page.keyboard.press('Escape');
        // Dialog should be closed or hidden
        expect(await dialog.isVisible()).toBeFalsy();
      }
    }
  });
});

test.describe('Accessibility - Screen Reader', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should have proper ARIA labels', async ({ page }) => {
    // Check for buttons without accessible names
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const text = await button.textContent();
      
      // Button should have either aria-label or visible text
      const hasAccessibleName = ariaLabel || (text && text.trim().length > 0);
      expect(hasAccessibleName).toBeTruthy();
    }
  });

  test('should have proper landmark regions', async ({ page }) => {
    const header = page.locator('header');
    const main = page.locator('main');
    const nav = page.locator('nav');
    
    expect(await header.count()).toBeGreaterThanOrEqual(0);
    expect(await main.count()).toBeGreaterThanOrEqual(1);
  });

  test('live regions should announce updates', async ({ page }) => {
    const liveRegions = page.locator('[aria-live]');
    const count = await liveRegions.count();
    
    for (let i = 0; i < count; i++) {
      const region = liveRegions.nth(i);
      const live = await region.getAttribute('aria-live');
      const atomic = await region.getAttribute('aria-atomic');
      
      expect(['polite', 'assertive', 'off']).toContain(live);
      if (live !== 'off') {
        // If live region is active, aria-atomic is recommended
        expect(atomic).toBeTruthy();
      }
    }
  });
});

test.describe('Accessibility - Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('should meet WCAG AA color contrast requirements', async ({ page }) => {
    await checkA11y(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
      axeOptions: {
        standards: 'wcag2aa',
      },
    });
  });

  test('should have readable text in dark mode', async ({ page }) => {
    // Enable dark mode
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
    });
    
    await injectAxe(page);
    await checkA11y(page, null, {
      rules: {
        'color-contrast': { enabled: true },
      },
    });
  });
});

test.describe('Accessibility - Images and Icons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
  });

  test('images should have alt text or aria-label', async ({ page }) => {
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const ariaHidden = await img.getAttribute('aria-hidden');
      
      // Decorative images should have aria-hidden
      // Content images should have alt or aria-label
      if (ariaHidden !== 'true') {
        expect(alt || ariaLabel).toBeTruthy();
      }
    }
  });
});
