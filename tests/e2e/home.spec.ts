import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('renders without error', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBeLessThan(400);
  });

  test('has a page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/);
  });

  test('renders a main content area', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
  });

  test('internal links resolve without 4xx errors', async ({ page }) => {
    await page.goto('/');
    const links = page.locator('a[href^="/"]');
    const hrefs = await links.evaluateAll((els) =>
      (els as HTMLAnchorElement[]).map((el) => el.getAttribute('href')).filter(Boolean)
    );
    for (const href of hrefs) {
      const res = await page.request.get(href!);
      expect(res.status(), `Broken link: ${href}`).toBeLessThan(400);
    }
  });
});
