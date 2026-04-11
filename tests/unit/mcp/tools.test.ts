import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
}));

import * as fs from 'node:fs/promises';
import {
  invertList,
  invertGet,
  invertSearch,
  invertTypes,
  invertCreate,
  invertUpdate,
  invertDelete,
  invertNormalizeAndCreate,
} from '../../../mcp/tools.ts';
import type { InvertContent } from '../../../src/adapters/interface.ts';

const makeItem = (overrides: Partial<InvertContent> = {}): InvertContent => ({
  id: 'test-1',
  slug: 'test-post',
  title: 'Test Post',
  body: '<p>Body</p>',
  contentType: 'posts',
  ...overrides,
});

const serialize = (item: InvertContent) => JSON.stringify(item);

// ---------------------------------------------------------------------------
// invertList
// ---------------------------------------------------------------------------

describe('invertList()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns all items across type directories', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['test-post.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(serialize(makeItem()) as any);

    const items = await invertList();

    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe('test-post');
  });

  it('scopes to a single type when contentType is provided', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['test-post.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(serialize(makeItem()) as any);

    const items = await invertList('posts');

    expect(items).toHaveLength(1);
  });

  it('applies limit and offset for pagination', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['a.json', 'b.json', 'c.json'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(serialize(makeItem({ id: 'a', slug: 'a' })) as any)
      .mockResolvedValueOnce(serialize(makeItem({ id: 'b', slug: 'b' })) as any)
      .mockResolvedValueOnce(serialize(makeItem({ id: 'c', slug: 'c' })) as any);

    const items = await invertList(undefined, 2, 1);

    expect(items).toHaveLength(2);
    expect(items[0].slug).toBe('b');
    expect(items[1].slug).toBe('c');
  });

  it('returns empty array when content directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const items = await invertList();

    expect(items).toEqual([]);
  });

  it('skips malformed JSON files', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['valid.json', 'broken.json'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(serialize(makeItem()) as any)
      .mockResolvedValueOnce('{ invalid' as any);

    const items = await invertList();

    expect(items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// invertGet
// ---------------------------------------------------------------------------

describe('invertGet()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns a content item by type and slug', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(serialize(makeItem()) as any);

    const item = await invertGet('posts', 'test-post');

    expect(item?.slug).toBe('test-post');
  });

  it('returns null when file does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const item = await invertGet('posts', 'nonexistent');

    expect(item).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// invertSearch
// ---------------------------------------------------------------------------

describe('invertSearch()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('matches items by title', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['guide.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      serialize(makeItem({ slug: 'guide', title: 'Python Guide', body: '' })) as any
    );

    const results = await invertSearch('python');

    expect(results.some((i) => i.slug === 'guide')).toBe(true);
  });

  it('matches items by body', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['post.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      serialize(makeItem({ body: '<p>Learn TypeScript today</p>' })) as any
    );

    const results = await invertSearch('typescript');

    expect(results).toHaveLength(1);
  });

  it('matches items by excerpt', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['post.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      serialize(makeItem({ excerpt: 'A quick intro to Astro' })) as any
    );

    const results = await invertSearch('astro');

    expect(results).toHaveLength(1);
  });

  it('is case-insensitive', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['guide.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      serialize(makeItem({ title: 'Python Guide' })) as any
    );

    const results = await invertSearch('PYTHON');

    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// invertTypes
// ---------------------------------------------------------------------------

describe('invertTypes()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the list of type directories', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['posts', 'pages'] as any);

    const types = await invertTypes();

    expect(types).toEqual(['posts', 'pages']);
  });

  it('returns empty array when content directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const types = await invertTypes();

    expect(types).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// invertCreate
// ---------------------------------------------------------------------------

describe('invertCreate()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('writes a JSON file and returns its path', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    const item = makeItem();
    const result = await invertCreate(item);

    expect(result.path).toContain('test-post.json');
    expect(result.path).toContain('posts');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('test-post.json'),
      JSON.stringify(item, null, 2),
      'utf-8'
    );
  });

  it('creates the type directory if it does not exist', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    await invertCreate(makeItem());

    expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// invertUpdate
// ---------------------------------------------------------------------------

describe('invertUpdate()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('merges updates into an existing item and writes it', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(serialize(makeItem()) as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    const updated = await invertUpdate('posts', 'test-post', { title: 'New Title' });

    expect(updated?.title).toBe('New Title');
    expect(updated?.body).toBe('<p>Body</p>'); // unchanged field preserved
  });

  it('returns null when the item does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await invertUpdate('posts', 'nonexistent', { title: 'X' });

    expect(result).toBeNull();
  });

  it('does not call writeFile when item is not found', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    await invertUpdate('posts', 'nonexistent', { title: 'X' });

    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// invertDelete
// ---------------------------------------------------------------------------

describe('invertDelete()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes the file and returns { deleted: true }', async () => {
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    const result = await invertDelete('posts', 'test-post');

    expect(result.deleted).toBe(true);
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('test-post.json'));
  });

  it('returns { deleted: false } when the file does not exist', async () => {
    vi.mocked(fs.unlink).mockRejectedValue(new Error('ENOENT'));

    const result = await invertDelete('posts', 'nonexistent');

    expect(result.deleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// invertNormalizeAndCreate — WordPress
// ---------------------------------------------------------------------------

describe('invertNormalizeAndCreate() — WordPress', () => {
  beforeEach(() => vi.resetAllMocks());

  const wpPost = {
    id: 42,
    slug: 'python-guide',
    type: 'post',
    date: '2026-01-01T00:00:00',
    modified: '2026-01-02T00:00:00',
    link: 'https://example.com/python-guide/',
    title: { rendered: 'Python Guide' },
    content: { rendered: '<p>Learn Python</p>' },
    excerpt: { rendered: '<p>Intro to Python</p>' },
    _embedded: {
      author: [{ name: 'Jane Doe' }],
      'wp:featuredmedia': [{ source_url: 'https://example.com/image.jpg' }],
      'wp:term': [
        [{ slug: 'tutorials' }],
        [{ slug: 'python' }, { slug: 'beginner' }],
      ],
    },
  };

  const getSaved = (): InvertContent => {
    const [, written] = vi.mocked(fs.writeFile).mock.calls[0];
    return JSON.parse(written as string) as InvertContent;
  };

  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
  });

  it('maps id, slug, title, body, and contentType', async () => {
    await invertNormalizeAndCreate(wpPost as any, 'wordpress');
    const saved = getSaved();

    expect(saved.id).toBe('42');
    expect(saved.slug).toBe('python-guide');
    expect(saved.title).toBe('Python Guide');
    expect(saved.body).toBe('<p>Learn Python</p>');
    expect(saved.contentType).toBe('post');
  });

  it('maps author, excerpt, and featuredImage from _embedded', async () => {
    await invertNormalizeAndCreate(wpPost as any, 'wordpress');
    const saved = getSaved();

    expect(saved.author).toBe('Jane Doe');
    expect(saved.excerpt).toBe('<p>Intro to Python</p>');
    expect(saved.featuredImage).toBe('https://example.com/image.jpg');
  });

  it('maps wp:term[0] to categories and wp:term[1] to tags', async () => {
    await invertNormalizeAndCreate(wpPost as any, 'wordpress');
    const saved = getSaved();

    expect(saved.taxonomies?.categories).toEqual(['tutorials']);
    expect(saved.taxonomies?.tags).toEqual(['python', 'beginner']);
  });

  it('stores wpId and sourceUrl in meta', async () => {
    await invertNormalizeAndCreate(wpPost as any, 'wordpress');
    const saved = getSaved();

    expect(saved.meta?.wpId).toBe(42);
    expect(saved.meta?.sourceUrl).toBe('https://example.com/python-guide/');
  });

  it('applies contentType override', async () => {
    await invertNormalizeAndCreate(wpPost as any, 'wordpress', 'articles');
    const saved = getSaved();

    expect(saved.contentType).toBe('articles');
  });

  it('handles a post without _embedded gracefully', async () => {
    const bare = { id: 1, slug: 'bare', type: 'post', title: { rendered: 'Bare' }, content: { rendered: '' } };
    await invertNormalizeAndCreate(bare as any, 'wordpress');
    const saved = getSaved();

    expect(saved.slug).toBe('bare');
    expect(saved.taxonomies).toBeUndefined();
    expect(saved.author).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// invertNormalizeAndCreate — Drupal
// ---------------------------------------------------------------------------

describe('invertNormalizeAndCreate() — Drupal', () => {
  beforeEach(() => vi.resetAllMocks());

  const drupalNode = {
    data: {
      type: 'node--article',
      id: 'uuid-123',
      attributes: {
        drupal_internal__nid: 99,
        title: 'Drupal Post',
        body: {
          value: '<p>Raw body</p>',
          processed: '<p>Processed body</p>',
          summary: 'A summary',
        },
        path: { alias: '/drupal-post' },
        created: '2026-02-01T00:00:00+00:00',
        changed: '2026-02-02T00:00:00+00:00',
      },
    },
  };

  const getSaved = (): InvertContent => {
    const [, written] = vi.mocked(fs.writeFile).mock.calls[0];
    return JSON.parse(written as string) as InvertContent;
  };

  beforeEach(() => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
  });

  it('maps id, slug, title, body, and contentType', async () => {
    await invertNormalizeAndCreate(drupalNode as any, 'drupal');
    const saved = getSaved();

    expect(saved.id).toBe('uuid-123');
    expect(saved.slug).toBe('drupal-post'); // leading slash stripped
    expect(saved.title).toBe('Drupal Post');
    expect(saved.body).toBe('<p>Processed body</p>'); // processed over value
    expect(saved.contentType).toBe('article'); // 'node--' prefix stripped
  });

  it('prefers body.processed over body.value', async () => {
    await invertNormalizeAndCreate(drupalNode as any, 'drupal');
    const saved = getSaved();

    expect(saved.body).toBe('<p>Processed body</p>');
  });

  it('maps excerpt from body.summary', async () => {
    await invertNormalizeAndCreate(drupalNode as any, 'drupal');
    const saved = getSaved();

    expect(saved.excerpt).toBe('A summary');
  });

  it('maps field_summary to excerpt when present', async () => {
    const withFieldSummary = {
      data: {
        ...drupalNode.data,
        attributes: { ...drupalNode.data.attributes, field_summary: 'Custom summary' },
      },
    };
    await invertNormalizeAndCreate(withFieldSummary as any, 'drupal');
    const saved = getSaved();

    // field_summary takes precedence over body.summary
    expect(saved.excerpt).toBe('Custom summary');
  });

  it('strips the "node--" prefix from content type', async () => {
    await invertNormalizeAndCreate(drupalNode as any, 'drupal');
    const saved = getSaved();

    expect(saved.contentType).toBe('article');
  });

  it('stores drupalId and drupalNid in meta', async () => {
    await invertNormalizeAndCreate(drupalNode as any, 'drupal');
    const saved = getSaved();

    expect(saved.meta?.drupalId).toBe('uuid-123');
    expect(saved.meta?.drupalNid).toBe(99);
  });

  it('falls back to nid as slug when path alias is absent', async () => {
    const noAlias = {
      data: { type: 'node--page', id: 'uuid-456', attributes: { drupal_internal__nid: 77, title: 'No Alias', body: { value: 'x', processed: 'x' } } },
    };
    await invertNormalizeAndCreate(noAlias as any, 'drupal');
    const saved = getSaved();

    expect(saved.slug).toBe('77');
  });

  it('applies contentType override', async () => {
    await invertNormalizeAndCreate(drupalNode as any, 'drupal', 'blog');
    const saved = getSaved();

    expect(saved.contentType).toBe('blog');
  });
});
