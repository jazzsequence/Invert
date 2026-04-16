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

  it('uses type and slug from params to build the KV key', async () => {
    const kv = makeMockKV({
      'draft:articles:deep-dive': JSON.stringify({ ...makeDraft(), contentType: 'articles', slug: 'deep-dive' }),
    });
    const { response } = await callPreview(kv, 'articles', 'deep-dive');

    expect(response.status).toBe(200);
    expect(kv.get).toHaveBeenCalledWith('draft:articles:deep-dive');
  });
});
