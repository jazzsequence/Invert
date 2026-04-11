import { test, expect } from '@playwright/test';

test.describe('OG / social meta tags', () => {
  test('content page has og:title matching the page title', async ({ page }) => {
    await page.goto('/docs/getting-started');
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', /Getting Started/);
  });

  test('content page has og:type of article', async ({ page }) => {
    await page.goto('/docs/getting-started');
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute('content', 'article');
  });

  test('content page has og:description when excerpt is present', async ({ page }) => {
    await page.goto('/docs/getting-started');
    const ogDesc = page.locator('meta[property="og:description"]');
    await expect(ogDesc).toHaveCount(1);
    const content = await ogDesc.getAttribute('content');
    expect(content?.length).toBeGreaterThan(0);
  });

  test('content page has a twitter:card meta tag', async ({ page }) => {
    await page.goto('/docs/getting-started');
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveCount(1);
  });

  test('content page has a canonical link', async ({ page }) => {
    await page.goto('/docs/getting-started');
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const href = await canonical.getAttribute('href');
    expect(href).toContain('getting-started');
  });

  test('home page has og:type of website', async ({ page }) => {
    await page.goto('/');
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute('content', 'website');
  });

  test('content page has og:site_name', async ({ page }) => {
    await page.goto('/docs/getting-started');
    const siteName = page.locator('meta[property="og:site_name"]');
    await expect(siteName).toHaveCount(1);
  });
});
