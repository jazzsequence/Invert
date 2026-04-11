import { describe, it, expect, vi } from 'vitest';

// DocsAdapter wraps MarkdownAdapter — mock it to control input.
// Uses a regular function (not arrow) so it works as a constructor with `new`.
vi.mock('../../../src/adapters/markdown.ts', () => {
  const items = [
    { id: 'slug-only', slug: 'slug-only', title: 'slug-only', body: '<h1>Extracted Title</h1><p>Body content.</p>', contentType: 'post' },
    { id: 'explicit-title', slug: 'explicit-title', title: 'Explicit Title', body: '<p>No h1 here.</p>', contentType: 'post' },
    { id: 'no-h1', slug: 'no-h1', title: 'no-h1', body: '<p>Just a paragraph.</p>', contentType: 'post' },
  ];
  return {
    MarkdownAdapter: vi.fn().mockImplementation(function () {
      this.getAll = vi.fn().mockResolvedValue(items);
      this.getBySlug = vi.fn().mockImplementation(async (slug: string) => {
        if (slug === 'explicit-title') {
          return { id: 'explicit-title', slug, title: 'Explicit Title', body: '', contentType: 'post' };
        }
        return null;
      });
    }),
  };
});

import { DocsAdapter } from '../../../src/adapters/docs.ts';

describe('DocsAdapter', () => {
  it('forces contentType to "docs" on all items', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const items = await adapter.getAll();

    expect(items.every((i) => i.contentType === 'docs')).toBe(true);
  });

  it('extracts the first h1 as title when title equals slug', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const items = await adapter.getAll();
    const item = items.find((i) => i.slug === 'slug-only');

    expect(item?.title).toBe('Extracted Title');
  });

  it('preserves an explicit title when it differs from the slug', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const items = await adapter.getAll();
    const item = items.find((i) => i.slug === 'explicit-title');

    expect(item?.title).toBe('Explicit Title');
  });

  it('falls back to slug as title when no h1 is present', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const items = await adapter.getAll();
    const item = items.find((i) => i.slug === 'no-h1');

    expect(item?.title).toBe('no-h1');
  });

  it('returns empty array for any contentType other than "docs"', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const items = await adapter.getByType('posts');

    expect(items).toEqual([]);
  });

  it('returns all items for getByType("docs")', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const items = await adapter.getByType('docs');

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.contentType === 'docs')).toBe(true);
  });

  it('normalizes a single item returned by getBySlug', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const item = await adapter.getBySlug('explicit-title');

    expect(item?.contentType).toBe('docs');
  });

  it('returns null from getBySlug for a missing slug', async () => {
    const adapter = new DocsAdapter({ contentDir: '/fake/docs' });
    const item = await adapter.getBySlug('nonexistent');

    expect(item).toBeNull();
  });
});
