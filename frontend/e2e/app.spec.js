/**
 * Basic E2E tests for RipX app
 */
import { test, expect } from '@playwright/test';

test.describe('App', () => {
  test('loads and shows RipX title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/RipX/i);
  });

  test('page has main content', async ({ page }) => {
    await page.goto('/');
    // Connect page or Dashboard - look for RipX branding
    await expect(page.getByText(/RipX/i).first()).toBeVisible({ timeout: 10000 });
  });
});
