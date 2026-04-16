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
  invertPublish,
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
//
// invertList calls readDir(CONTENT_DIR) and readDir(DRAFTS_DIR) concurrently.
// Without a contentType filter, each readDir calls readdir(baseDir) first to
// get type dirs. Mock order: CONTENT_DIR types → DRAFTS_DIR types → file lists.
// ---------------------------------------------------------------------------

describe('invertList()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns all items across type directories', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)      // CONTENT_DIR type dirs
      .mockResolvedValueOnce([] as any)              // DRAFTS_DIR type dirs (empty)
      .mockResolvedValueOnce(['test-post.json'] as any); // CONTENT_DIR/posts files
    vi.mocked(fs.readFile).mockResolvedValue(serialize(makeItem()) as any);

    const items = await invertList();

    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe('test-post');
  });

  it('scopes to a single type when contentType is provided', async () => {
    // With a contentType, readDir skips the top-level readdir and goes straight
    // to the type path. Two concurrent calls: CONTENT_DIR/posts then DRAFTS_DIR/posts.
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['test-post.json'] as any) // CONTENT_DIR/posts files
      .mockResolvedValueOnce([] as any);                // DRAFTS_DIR/posts files (empty)
    vi.mocked(fs.readFile).mockResolvedValue(serialize(makeItem()) as any);

    const items = await invertList('posts');

    expect(items).toHaveLength(1);
  });

  it('applies limit and offset for pagination', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce([] as any)
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
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(['valid.json', 'broken.json'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(serialize(makeItem()) as any)
      .mockResolvedValueOnce('{ invalid' as any);

    const items = await invertList();

    expect(items).toHaveLength(1);
  });

  it('merges published and draft items, deduplicating by type::slug', async () => {
    const published = makeItem({ status: 'published' });
    const draft = makeItem({ id: 'draft-1', slug: 'draft-post', status: 'draft' });
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)             // CONTENT_DIR types
      .mockResolvedValueOnce(['posts'] as any)             // DRAFTS_DIR types
      .mockResolvedValueOnce(['test-post.json'] as any)    // CONTENT_DIR/posts files
      .mockResolvedValueOnce(['draft-post.json'] as any);  // DRAFTS_DIR/posts files
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(serialize(published) as any)
      .mockResolvedValueOnce(serialize(draft) as any);

    const items = await invertList();

    expect(items).toHaveLength(2);
    expect(items.find((i) => i.slug === 'test-post')).toBeDefined();
    expect(items.find((i) => i.slug === 'draft-post')).toBeDefined();
  });

  it('deduplicate by type::slug when same slug exists in both dirs (published wins)', async () => {
    const published = makeItem({ status: 'published' });
    const duplicate = makeItem({ status: 'draft' }); // same slug as published
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['test-post.json'] as any)
      .mockResolvedValueOnce(['test-post.json'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(serialize(published) as any)
      .mockResolvedValueOnce(serialize(duplicate) as any);

    const items = await invertList();

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('published');
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

  it('returns null when file does not exist in either dir', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const item = await invertGet('posts', 'nonexistent');

    expect(item).toBeNull();
  });

  it('falls back to .drafts/ when not found in content/', async () => {
    const draft = makeItem({ status: 'draft' });
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error('ENOENT'))        // not in content/
      .mockResolvedValueOnce(serialize(draft) as any);   // found in .drafts/

    const item = await invertGet('posts', 'test-post');

    expect(item?.status).toBe('draft');
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
      .mockResolvedValueOnce([] as any)
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
      .mockResolvedValueOnce([] as any)
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
      .mockResolvedValueOnce([] as any)
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
      .mockResolvedValueOnce([] as any)
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

  it('returns the list of type directories from both content/ and .drafts/', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts', 'pages'] as any) // CONTENT_DIR
      .mockResolvedValueOnce(['drafts-only'] as any);   // DRAFTS_DIR

    const types = await invertTypes();

    expect(types).toContain('posts');
    expect(types).toContain('pages');
    expect(types).toContain('drafts-only');
  });

  it('deduplicates types that exist in both dirs', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts', 'pages'] as any)
      .mockResolvedValueOnce(['posts'] as any); // 'posts' in both

    const types = await invertTypes();

    expect(types.filter((t) => t === 'posts')).toHaveLength(1);
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

  it('writes a JSON file to content/ and returns its path', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    const item = makeItem();
    const result = await invertCreate(item);

    expect(result.path).toContain('test-post.json');
    expect(result.path).toContain('posts');
    expect(result.path).not.toContain('.drafts');
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

  it('routes draft content to .drafts/ when status is "draft"', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    const item = makeItem({ status: 'draft' });
    const result = await invertCreate(item);

    expect(result.path).toContain('.drafts');
    expect(result.path).not.toContain('content/');
  });

  it('routes published content to content/ when status is "published"', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    const item = makeItem({ status: 'published' });
    const result = await invertCreate(item);

    expect(result.path).toContain('content/');
    expect(result.path).not.toContain('.drafts');
  });

  it('routes to content/ when status is undefined (backwards compatible)', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);

    const item = makeItem(); // no status field
    const result = await invertCreate(item);

    expect(result.path).toContain('content/');
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

  it('moves file from .drafts/ to content/ when status changes to "published"', async () => {
    const draft = makeItem({ status: 'draft' });
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error('ENOENT'))         // not in content/
      .mockResolvedValueOnce(serialize(draft) as any);    // found in .drafts/
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    const updated = await invertUpdate('posts', 'test-post', { status: 'published' });

    expect(updated?.status).toBe('published');
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('.drafts'));
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('content/'),
      expect.any(String),
      'utf-8'
    );
  });

  it('moves file from content/ to .drafts/ when status changes to "draft"', async () => {
    const published = makeItem({ status: 'published' });
    vi.mocked(fs.readFile).mockResolvedValueOnce(serialize(published) as any); // found in content/
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    const updated = await invertUpdate('posts', 'test-post', { status: 'draft' });

    expect(updated?.status).toBe('draft');
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('content/'));
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.drafts'),
      expect.any(String),
      'utf-8'
    );
  });
});

// ---------------------------------------------------------------------------
// invertDelete
// ---------------------------------------------------------------------------

describe('invertDelete()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes the file and returns { deleted: true }', async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(serialize(makeItem()) as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    const result = await invertDelete('posts', 'test-post');

    expect(result.deleted).toBe(true);
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('test-post.json'));
  });

  it('returns { deleted: false } when the file does not exist in either dir', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await invertDelete('posts', 'nonexistent');

    expect(result.deleted).toBe(false);
  });

  it('deletes from .drafts/ when item is only there', async () => {
    const draft = makeItem({ status: 'draft' });
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error('ENOENT'))        // not in content/
      .mockResolvedValueOnce(serialize(draft) as any);   // found in .drafts/
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    const result = await invertDelete('posts', 'test-post');

    expect(result.deleted).toBe(true);
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('.drafts'));
  });
});

// ---------------------------------------------------------------------------
// invertPublish
// ---------------------------------------------------------------------------

describe('invertPublish()', () => {
  beforeEach(() => vi.resetAllMocks());

  it('moves a draft from .drafts/ to content/ with status "published"', async () => {
    const draft = makeItem({ status: 'draft' });
    vi.mocked(fs.readFile).mockResolvedValueOnce(serialize(draft) as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    const result = await invertPublish('posts', 'test-post');

    expect(result?.path).toContain('content/');
    expect(result?.path).toContain('test-post.json');
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('.drafts'));
    const [, written] = vi.mocked(fs.writeFile).mock.calls[0];
    const saved = JSON.parse(written as string) as InvertContent;
    expect(saved.status).toBe('published');
  });

  it('returns null when the draft does not exist', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    const result = await invertPublish('posts', 'nonexistent');

    expect(result).toBeNull();
  });

  it('does not write or unlink when draft is not found', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    await invertPublish('posts', 'nonexistent');

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it('preserves all existing fields when promoting to published', async () => {
    const draft = makeItem({
      status: 'draft',
      title: 'My Draft',
      author: 'Alice',
      excerpt: 'Short summary',
    });
    vi.mocked(fs.readFile).mockResolvedValueOnce(serialize(draft) as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    await invertPublish('posts', 'test-post');

    const [, written] = vi.mocked(fs.writeFile).mock.calls[0];
    const saved = JSON.parse(written as string) as InvertContent;
    expect(saved.title).toBe('My Draft');
    expect(saved.author).toBe('Alice');
    expect(saved.excerpt).toBe('Short summary');
    expect(saved.status).toBe('published');
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
