import { test, expect } from '@playwright/test';

// Requires content/test/draft-test.json with status: "draft" — committed as a test fixture.

test.describe('Draft preview', () => {
  test('draft content is not served at its canonical URL', async ({ page }) => {
    const res = await page.goto('/test/draft-test');
    expect(res?.status()).toBe(404);
  });

  test('draft content is accessible at its /preview URL', async ({ page }) => {
    const res = await page.goto('/preview/test/draft-test?preview');
    expect(res?.status()).toBeLessThan(400);
  });

  test('preview page shows draft content', async ({ page }) => {
    await page.goto('/preview/test/draft-test?preview');
    await expect(page.locator('main')).toContainText('Draft Test Post');
  });

  test('preview page shows a draft banner', async ({ page }) => {
    await page.goto('/preview/test/draft-test?preview');
    await expect(page.locator('[data-preview-banner]')).toBeVisible();
  });

  test('preview page has noindex meta', async ({ page }) => {
    await page.goto('/preview/test/draft-test?preview');
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });

  test('preview page title indicates draft status', async ({ page }) => {
    await page.goto('/preview/test/draft-test?preview');
    await expect(page).toHaveTitle(/Draft/i);
  });
});
