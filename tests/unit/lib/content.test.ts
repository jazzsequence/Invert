import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted — factory must be self-contained, no references to outer scope.
// Mock adapters before importing content functions that depend on them.
// Primary adapter wins deduplication; secondary provides unique items.
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
  it('merges content from all adapters', async () => {
    const items = await getAllContent();
    // 3 from primary + 1 unique from secondary (duplicate 'first' dropped)
    expect(items).toHaveLength(4);
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

  it('returns null when slug does not exist', async () => {
    const item = await getContentBySlug('posts', 'nonexistent');
    expect(item).toBeNull();
  });

  it('does not match across content types', async () => {
    // 'about' exists as a 'pages' item, not 'posts'
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

  it('contains no duplicates', async () => {
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

  it('returns empty array when nothing matches', async () => {
    const results = await searchContent('xyzzy-definitely-no-match');
    expect(results).toEqual([]);
  });
});
