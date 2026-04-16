/**
 * Tests for the draft preview Cloudflare Pages Function.
 *
 * functions/preview/[type]/[slug].ts reads from the draft: KV prefix and
 * renders a minimal HTML page with a noindex meta tag and draft banner.
 * It never touches the content: prefix — only drafts are previewable here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestGet } from '../../../functions/preview/[type]/[slug].ts';

// ---------------------------------------------------------------------------
// KV mock
// ---------------------------------------------------------------------------

function makeMockKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Content fixture
// ---------------------------------------------------------------------------

interface DraftOverrides {
  title?: string;
  body?: string;
  excerpt?: string;
}

function makeDraft(overrides: DraftOverrides = {}) {
  return {
    id: 'draft-1',
    slug: 'my-draft',
    title: overrides.title ?? 'My Draft Post',
    body: overrides.body ?? '<p>Draft body content.</p>',
    contentType: 'posts',
    status: 'draft' as const,
    ...(overrides.excerpt ? { excerpt: overrides.excerpt } : {}),
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function callPreview(
  kv: ReturnType<typeof makeMockKV>,
  type: string,
  slug: string
) {
  const request = new Request(`http://localhost/preview/${type}/${slug}`);
  const env = { CONTENT: kv };
  const params = { type, slug };
  const response = await onRequestGet({ request, env, params });
  const html = await response.text();
  return { response, html };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('preview/[type]/[slug]', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 404 when the draft does not exist', async () => {
    const kv = makeMockKV();
    const { response } = await callPreview(kv, 'posts', 'my-draft');

    expect(response.status).toBe(404);
  });

  it('returns 200 with HTML content-type when draft exists', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
    const { response } = await callPreview(kv, 'posts', 'my-draft');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
  });

  it('reads from draft: KV prefix, not content:', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
    await callPreview(kv, 'posts', 'my-draft');

    expect(kv.get).toHaveBeenCalledWith('draft:posts:my-draft');
    expect(kv.get).not.toHaveBeenCalledWith('content:posts:my-draft');
  });

  it('includes noindex meta tag', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).toContain('noindex');
  });

  it('includes a draft banner', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html.toLowerCase()).toContain('draft');
  });

  it('renders the content title', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft({ title: 'Unpublished Work' })),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).toContain('Unpublished Work');
  });

  it('renders the content body HTML', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft({ body: '<p>Hello <strong>world</strong></p>' })),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).toContain('<p>Hello <strong>world</strong></p>');
  });

  it('escapes title in HTML attributes and tags to prevent XSS', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft({ title: '<script>alert(1)</script>' })),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not include a body color rule that would fight the Astro theme', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    // body layout/color must come from the injected Astro stylesheet, not inline styles
    expect(html).not.toMatch(/body\s*\{[^}]*color\s*:/);
  });

  it('retains draft-specific inline styles', async () => {
    const kv = makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).toContain('.draft-banner');
    expect(html).toContain('.draft-label');
    expect(html).toContain('.back-link');
  });

  it('uses type and slug from params to build the KV key', async () => {
    const kv = makeMockKV({
      'draft:articles:deep-dive': JSON.stringify({ ...makeDraft(), contentType: 'articles', slug: 'deep-dive' }),
    });
    const { response } = await callPreview(kv, 'articles', 'deep-dive');

    expect(response.status).toBe(200);
    expect(kv.get).toHaveBeenCalledWith('draft:articles:deep-dive');
  });
});

// ---------------------------------------------------------------------------
// Stylesheet injection
// ---------------------------------------------------------------------------

describe('preview/[type]/[slug] — stylesheet injection', () => {
  beforeEach(() => vi.resetAllMocks());

  function stubHomepage(linkTags = '<link rel="stylesheet" href="/_astro/Base.ABC123.css">') {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(`<html><head>${linkTags}</head><body>home</body></html>`, { status: 200 })
    ));
  }

  function makeDraftKV() {
    return makeMockKV({
      'draft:posts:my-draft': JSON.stringify(makeDraft()),
    });
  }

  it('fetches the homepage to extract stylesheets', async () => {
    stubHomepage();
    const kv = makeDraftKV();
    await callPreview(kv, 'posts', 'my-draft');

    expect(vi.mocked(fetch)).toHaveBeenCalledWith('http://localhost/');
  });

  it('injects stylesheet link tags from the homepage into <head>', async () => {
    stubHomepage('<link rel="stylesheet" href="/_astro/Base.ABC123.css">');
    const kv = makeDraftKV();
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).toContain('<link rel="stylesheet" href="/_astro/Base.ABC123.css">');
  });

  it('injects all stylesheets when multiple are present', async () => {
    stubHomepage([
      '<link rel="stylesheet" href="/_astro/Base.ABC123.css">',
      '<link rel="stylesheet" href="/_astro/extra.XYZ789.css">',
    ].join('\n'));
    const kv = makeDraftKV();
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    expect(html).toContain('/_astro/Base.ABC123.css');
    expect(html).toContain('/_astro/extra.XYZ789.css');
  });

  it('still renders the page if the homepage fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    const kv = makeDraftKV();
    const { response, html } = await callPreview(kv, 'posts', 'my-draft');

    expect(response.status).toBe(200);
    expect(html).toContain('My Draft Post');
  });

  it('still renders if the homepage returns a non-200 status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    const kv = makeDraftKV();
    const { response, html } = await callPreview(kv, 'posts', 'my-draft');

    expect(response.status).toBe(200);
    expect(html).toContain('My Draft Post');
  });

  it('does not inject non-stylesheet link tags', async () => {
    stubHomepage([
      '<link rel="stylesheet" href="/_astro/Base.ABC123.css">',
      '<link rel="icon" href="/favicon.svg">',
    ].join('\n'));
    const kv = makeDraftKV();
    const { html } = await callPreview(kv, 'posts', 'my-draft');

    // stylesheet injected, favicon not (it's already in the template or not needed)
    expect(html).toContain('/_astro/Base.ABC123.css');
    // favicon link should not be duplicated from homepage scraping
    const faviconCount = (html.match(/favicon\.svg/g) ?? []).length;
    expect(faviconCount).toBeLessThanOrEqual(1);
  });
});
