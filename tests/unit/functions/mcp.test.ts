/**
 * Edge MCP draft routing tests.
 *
 * These test the behavior added to functions/api/mcp/index.ts for draft
 * content support:
 *   - invert_create with status:'draft' → draft: KV prefix, no GitHub commit
 *   - invert_create with status:'published' or omitted → content: KV prefix, GitHub queued
 *   - invert_publish → promotes draft: to content:, queues GitHub commit
 *   - invert_list → excludes drafts
 *   - invert_get → falls back to draft: prefix when not found in content:
 *   - invert_update status change → moves between KV prefixes
 *   - invert_delete → works on both prefixes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestPost } from '../../../functions/api/mcp/index.ts';

// ---------------------------------------------------------------------------
// KV mock — in-memory Map, tracks all calls
// ---------------------------------------------------------------------------

function makeMockKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    _store: store,
  };
}

// ---------------------------------------------------------------------------
// Fetch stub — returns empty static manifest; accepts GitHub API calls
// ---------------------------------------------------------------------------

function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts?: RequestInit) => {
    if (String(url).endsWith('/_api/content.json')) {
      return new Response(JSON.stringify({ items: [], generatedAt: '' }), { status: 200 });
    }
    // GitHub API GET (fetch current SHA)
    if (!opts?.method || opts.method === 'GET') {
      return new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 });
    }
    // GitHub API PUT / DELETE
    return new Response(JSON.stringify({ content: { sha: 'def456' } }), { status: 200 });
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(kv: ReturnType<typeof makeMockKV>, envOverrides: Record<string, unknown> = {}) {
  const waitUntil = vi.fn();
  return {
    env: { CONTENT: kv, ...envOverrides },
    waitUntil,
  };
}

async function callTool(
  kv: ReturnType<typeof makeMockKV>,
  toolName: string,
  args: Record<string, unknown>,
  envOverrides: Record<string, unknown> = {}
) {
  const { env, waitUntil } = makeContext(kv, envOverrides);
  const request = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
  const response = await onRequestPost({ request, env, waitUntil });
  const body = await response.json() as Record<string, unknown>;
  return { body, waitUntil };
}

/** All KV keys written during a call */
function putKeys(kv: ReturnType<typeof makeMockKV>): string[] {
  return kv.put.mock.calls.map(([key]: [string]) => key);
}

const withGitHub = { GITHUB_TOKEN: 'ghp_test', GITHUB_REPO: 'owner/repo' };

const baseItem = {
  id: 'post-1',
  slug: 'test-post',
  title: 'Test Post',
  body: '<p>Hello</p>',
  contentType: 'posts',
};

// ---------------------------------------------------------------------------
// invert_create — draft routing
// ---------------------------------------------------------------------------

describe('invert_create — draft routing', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('writes to draft: KV prefix when status is "draft"', async () => {
    const kv = makeMockKV();
    await callTool(kv, 'invert_create', { ...baseItem, status: 'draft' });

    expect(putKeys(kv)).toContain('draft:posts:test-post');
    expect(putKeys(kv)).not.toContain('content:posts:test-post');
  });

  it('does not queue a GitHub commit for drafts', async () => {
    const kv = makeMockKV();
    const { waitUntil } = await callTool(kv, 'invert_create', { ...baseItem, status: 'draft' }, withGitHub);

    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('writes to content: KV prefix when status is "published"', async () => {
    const kv = makeMockKV();
    await callTool(kv, 'invert_create', { ...baseItem, status: 'published' });

    expect(putKeys(kv)).toContain('content:posts:test-post');
    expect(putKeys(kv)).not.toContain('draft:posts:test-post');
  });

  it('writes to content: KV prefix when status is omitted (backwards compatible)', async () => {
    const kv = makeMockKV();
    await callTool(kv, 'invert_create', baseItem);

    expect(putKeys(kv)).toContain('content:posts:test-post');
    expect(putKeys(kv)).not.toContain('draft:posts:test-post');
  });

  it('queues a GitHub commit for published content', async () => {
    const kv = makeMockKV();
    const { waitUntil } = await callTool(kv, 'invert_create', baseItem, withGitHub);

    expect(waitUntil).toHaveBeenCalled();
  });

  it('stores status field in the KV value for draft items', async () => {
    const kv = makeMockKV();
    await callTool(kv, 'invert_create', { ...baseItem, status: 'draft' });

    const draftCall = kv.put.mock.calls.find(([key]: [string]) => key === 'draft:posts:test-post');
    expect(draftCall).toBeDefined();
    const stored = JSON.parse(draftCall![1]);
    expect(stored.status).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// invert_publish
// ---------------------------------------------------------------------------

describe('invert_publish', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('writes promoted item to content: KV prefix', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    await callTool(kv, 'invert_publish', { contentType: 'posts', slug: 'test-post' });

    expect(putKeys(kv)).toContain('content:posts:test-post');
  });

  it('deletes the draft: KV entry after promotion', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    await callTool(kv, 'invert_publish', { contentType: 'posts', slug: 'test-post' });

    expect(kv.delete).toHaveBeenCalledWith('draft:posts:test-post');
  });

  it('sets status to "published" on the promoted item', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    await callTool(kv, 'invert_publish', { contentType: 'posts', slug: 'test-post' });

    const contentCall = kv.put.mock.calls.find(([key]: [string]) => key === 'content:posts:test-post');
    expect(contentCall).toBeDefined();
    const stored = JSON.parse(contentCall![1]);
    expect(stored.status).toBe('published');
  });

  it('queues a GitHub commit after promotion', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    const { waitUntil } = await callTool(
      kv, 'invert_publish', { contentType: 'posts', slug: 'test-post' }, withGitHub
    );

    expect(waitUntil).toHaveBeenCalled();
  });

  it('returns an error when the draft does not exist', async () => {
    const kv = makeMockKV();

    const { body } = await callTool(kv, 'invert_publish', { contentType: 'posts', slug: 'nonexistent' });

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/not found/i);
  });

  it('does not write or delete when draft is not found', async () => {
    const kv = makeMockKV();

    await callTool(kv, 'invert_publish', { contentType: 'posts', slug: 'nonexistent' });

    expect(putKeys(kv)).not.toContain('content:posts:nonexistent');
    expect(kv.delete).not.toHaveBeenCalled();
  });

  it('preserves all content fields during promotion', async () => {
    const draft = { ...baseItem, status: 'draft' as const, author: 'Alice', excerpt: 'Short' };
    const kv = makeMockKV({ 'draft:posts:test-post': JSON.stringify(draft) });

    await callTool(kv, 'invert_publish', { contentType: 'posts', slug: 'test-post' });

    const contentCall = kv.put.mock.calls.find(([key]: [string]) => key === 'content:posts:test-post');
    const stored = JSON.parse(contentCall![1]);
    expect(stored.author).toBe('Alice');
    expect(stored.excerpt).toBe('Short');
    expect(stored.title).toBe('Test Post');
  });
});

// ---------------------------------------------------------------------------
// invert_list — draft exclusion
// ---------------------------------------------------------------------------

describe('invert_list — draft exclusion', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('excludes draft items from the listing', async () => {
    const index = JSON.stringify([
      { type: 'posts', slug: 'published-post', title: 'Published' },
    ]);
    const draftIndex = JSON.stringify([
      { type: 'posts', slug: 'draft-post', title: 'Draft' },
    ]);
    const kv = makeMockKV({ _index: index, _draft_index: draftIndex });

    const { body } = await callTool(kv, 'invert_list', {});

    const items = JSON.parse(body.result.content[0].text);
    expect(items.some((i: { slug: string }) => i.slug === 'published-post')).toBe(true);
    expect(items.some((i: { slug: string }) => i.slug === 'draft-post')).toBe(false);
  });

  it('returns published items only when both exist', async () => {
    const index = JSON.stringify([
      { type: 'posts', slug: 'live', title: 'Live Post' },
    ]);
    const kv = makeMockKV({ _index: index });

    const { body } = await callTool(kv, 'invert_list', {});

    const items = JSON.parse(body.result.content[0].text);
    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe('live');
  });
});

// ---------------------------------------------------------------------------
// invert_get — falls back to draft: prefix
// ---------------------------------------------------------------------------

describe('invert_get — draft fallback', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('returns a draft item when only in draft: prefix', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    const { body } = await callTool(kv, 'invert_get', { contentType: 'posts', slug: 'test-post' });

    const item = JSON.parse(body.result.content[0].text);
    expect(item.slug).toBe('test-post');
    expect(item.status).toBe('draft');
  });

  it('prefers content: over draft: when both exist', async () => {
    const kv = makeMockKV({
      'content:posts:test-post': JSON.stringify({ ...baseItem, status: 'published' }),
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    const { body } = await callTool(kv, 'invert_get', { contentType: 'posts', slug: 'test-post' });

    const item = JSON.parse(body.result.content[0].text);
    expect(item.status).toBe('published');
  });
});

// ---------------------------------------------------------------------------
// invert_update — status change moves between stores
// ---------------------------------------------------------------------------

describe('invert_update — status change', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('moves item from draft: to content: when status changes to "published"', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    await callTool(
      kv, 'invert_update',
      { contentType: 'posts', slug: 'test-post', updates: { status: 'published' } },
      withGitHub
    );

    expect(putKeys(kv)).toContain('content:posts:test-post');
    expect(kv.delete).toHaveBeenCalledWith('draft:posts:test-post');
  });

  it('queues a GitHub commit when promoting via update', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    const { waitUntil } = await callTool(
      kv, 'invert_update',
      { contentType: 'posts', slug: 'test-post', updates: { status: 'published' } },
      withGitHub
    );

    expect(waitUntil).toHaveBeenCalled();
  });

  it('does not queue a GitHub commit when updating a draft without changing status', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    const { waitUntil } = await callTool(
      kv, 'invert_update',
      { contentType: 'posts', slug: 'test-post', updates: { title: 'New Title' } },
      withGitHub
    );

    expect(waitUntil).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// invert_delete — works on both stores
// ---------------------------------------------------------------------------

describe('invert_delete — draft-aware', () => {
  beforeEach(() => stubFetch());
  afterEach(() => vi.unstubAllGlobals());

  it('deletes a draft item from the draft: prefix', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    await callTool(kv, 'invert_delete', { contentType: 'posts', slug: 'test-post' });

    expect(kv.delete).toHaveBeenCalledWith('draft:posts:test-post');
  });

  it('does not queue a GitHub commit when deleting a draft', async () => {
    const kv = makeMockKV({
      'draft:posts:test-post': JSON.stringify({ ...baseItem, status: 'draft' }),
    });

    const { waitUntil } = await callTool(
      kv, 'invert_delete',
      { contentType: 'posts', slug: 'test-post' },
      withGitHub
    );

    expect(waitUntil).not.toHaveBeenCalled();
  });
});
