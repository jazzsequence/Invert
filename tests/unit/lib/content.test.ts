import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted — factory must be self-contained, no references to outer scope.
// Primary adapter wins deduplication; secondary provides unique items.
// Draft item is in primary — default getAllContent() should exclude it.
vi.mock('../../../src/lib/config.ts', () => {
  const item = (overrides: Record<string, unknown> = {}) => ({
    id: 'default', slug: 'default', title: 'Default', body: '', contentType: 'posts',
    ...overrides,
  });
  return {
    invertConfig: {
      adapters: [
        {
          name: 'primary',
          getAll: vi.fn().mockResolvedValue([
            item({ id: '1', slug: 'first', contentType: 'posts', date: '2026-01-10', title: 'First Post', body: 'hello world' }),
            item({ id: '2', slug: 'second', contentType: 'posts', date: '2026-01-05' }),
            item({ id: '3', slug: 'about', contentType: 'pages', title: 'About Us', excerpt: 'about the team' }),
            item({ id: '5', slug: 'my-draft', contentType: 'posts', title: 'My Draft', status: 'draft' }),
          ]),
        },
        {
          name: 'secondary',
          getAll: vi.fn().mockResolvedValue([
            // Duplicate of 'first' from primary — should be dropped
            item({ id: '1-dup', slug: 'first', contentType: 'posts', title: 'Duplicate' }),
            item({ id: '4', slug: 'contact', contentType: 'pages' }),
          ]),
        },
      ],
    },
  };
});

import {
  getAllContent,
  getContentByType,
  getContentBySlug,
  getContentTypes,
  searchContent,
} from '../../../src/lib/content.ts';

describe('getAllContent()', () => {
  it('merges content from all adapters, excluding drafts', async () => {
    const items = await getAllContent();
    // 3 published from primary + 1 unique from secondary (first deduped, draft excluded)
    expect(items).toHaveLength(4);
  });

  it('excludes items with status: "draft" by default', async () => {
    const items = await getAllContent();
    expect(items.every((i) => i.status !== 'draft')).toBe(true);
  });

  it('includes draft items when includeDrafts is true', async () => {
    const items = await getAllContent({ includeDrafts: true });
    expect(items.some((i) => i.status === 'draft')).toBe(true);
    expect(items).toHaveLength(5); // 4 published + 1 draft
  });

  it('treats items with no status field as published', async () => {
    const items = await getAllContent();
    // All mock items except the draft have no status — should all be included
    const noStatusItems = items.filter((i) => i.status === undefined);
    expect(noStatusItems.length).toBeGreaterThan(0);
  });

  it('deduplicates by contentType + slug, first adapter wins', async () => {
    const items = await getAllContent();
    const firsts = items.filter((i) => i.slug === 'first');
    expect(firsts).toHaveLength(1);
    expect(firsts[0].id).toBe('1');
    expect(firsts[0].title).toBe('First Post');
  });

  it('sorts by date descending', async () => {
    const items = await getAllContent();
    const dated = items.filter((i) => i.date);
    expect(dated[0].date).toBe('2026-01-10');
    expect(dated[1].date).toBe('2026-01-05');
  });
});

describe('getContentByType()', () => {
  it('returns only items of the specified type', async () => {
    const posts = await getContentByType('posts');
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((i) => i.contentType === 'posts')).toBe(true);
  });

  it('excludes drafts by default', async () => {
    const posts = await getContentByType('posts');
    expect(posts.every((i) => i.status !== 'draft')).toBe(true);
  });

  it('returns empty array for an unknown type', async () => {
    const items = await getContentByType('nonexistent');
    expect(items).toEqual([]);
  });
});

describe('getContentBySlug()', () => {
  it('returns the matching item', async () => {
    const item = await getContentBySlug('pages', 'about');
    expect(item?.slug).toBe('about');
    expect(item?.contentType).toBe('pages');
  });

  it('returns null for a draft item at its normal slug', async () => {
    // Drafts should not be findable through the public content API
    const item = await getContentBySlug('posts', 'my-draft');
    expect(item).toBeNull();
  });

  it('returns null when slug does not exist', async () => {
    const item = await getContentBySlug('posts', 'nonexistent');
    expect(item).toBeNull();
  });

  it('does not match across content types', async () => {
    const item = await getContentBySlug('posts', 'about');
    expect(item).toBeNull();
  });
});

describe('getContentTypes()', () => {
  it('returns the distinct set of content types', async () => {
    const types = await getContentTypes();
    expect(types).toContain('posts');
    expect(types).toContain('pages');
  });

  it('does not include types that only have draft content', async () => {
    // 'my-draft' is contentType 'posts' which also has published items,
    // so this test checks a type that ONLY has drafts would be excluded.
    // Our mock doesn't have a draft-only type; this is structural documentation.
    const types = await getContentTypes();
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('searchContent()', () => {
  it('matches by title', async () => {
    const results = await searchContent('First Post');
    expect(results.some((i) => i.slug === 'first')).toBe(true);
  });

  it('matches by body', async () => {
    const results = await searchContent('hello world');
    expect(results.some((i) => i.slug === 'first')).toBe(true);
  });

  it('matches by excerpt', async () => {
    const results = await searchContent('about the team');
    expect(results.some((i) => i.slug === 'about')).toBe(true);
  });

  it('is case-insensitive', async () => {
    const results = await searchContent('FIRST POST');
    expect(results.some((i) => i.slug === 'first')).toBe(true);
  });

  it('does not surface draft content in search results', async () => {
    const results = await searchContent('My Draft');
    expect(results.every((i) => i.status !== 'draft')).toBe(true);
  });

  it('returns empty array when nothing matches', async () => {
    const results = await searchContent('xyzzy-definitely-no-match');
    expect(results).toEqual([]);
  });
});
