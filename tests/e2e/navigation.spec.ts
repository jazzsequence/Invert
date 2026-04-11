import { test, expect } from '@playwright/test';

test.describe('Content routing', () => {
  test('docs index renders', async ({ page }) => {
    const res = await page.goto('/docs');
    expect(res?.status()).toBeLessThan(400);
  });

  test('getting-started doc page renders with an h1 in main content', async ({ page }) => {
    const res = await page.goto('/docs/getting-started');
    expect(res?.status()).toBeLessThan(400);
    // Scope to main to avoid strict-mode collision with the site header h1
    await expect(page.locator('main h1').first()).toBeVisible();
  });

  test('a content item from the markdown adapter renders', async ({ page }) => {
    // markdown/about.md has contentType: pages → route is /pages/about
    const res = await page.goto('/pages/about');
    expect(res?.status()).toBeLessThan(400);
  });

  test('404 page is served for unknown routes', async ({ page }) => {
    const res = await page.goto('/this-route-definitely-does-not-exist-xyzzy');
    expect(res?.status()).toBe(404);
  });
});
