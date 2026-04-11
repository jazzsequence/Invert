import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import * as fs from 'node:fs/promises';
import { JsonAdapter } from '../../../src/adapters/json.ts';

const VALID_ITEM = JSON.stringify({
  id: 'post-1',
  slug: 'hello-world',
  title: 'Hello World',
  body: '<p>Hello</p>',
  contentType: 'posts',
});

describe('JsonAdapter', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reads all JSON files from type subdirectories', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['hello-world.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(VALID_ITEM as any);

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getAll();

    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe('hello-world');
    expect(items[0].contentType).toBe('posts');
  });

  it('infers slug from filename when not present in JSON', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['my-post.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ title: 'My Post', body: '' }) as any
    );

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getAll();

    expect(items[0].slug).toBe('my-post');
    expect(items[0].id).toBe('my-post');
  });

  it('infers contentType from directory name when not present in JSON', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['pages'] as any)
      .mockResolvedValueOnce(['about.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ title: 'About', body: '' }) as any
    );

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getAll();

    expect(items[0].contentType).toBe('pages');
  });

  it('ignores non-.json files', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['post.json', 'post.md', '.DS_Store'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(VALID_ITEM as any);

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getAll();

    expect(items).toHaveLength(1);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when content directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const adapter = new JsonAdapter({ contentDir: '/nonexistent' });
    const items = await adapter.getAll();

    expect(items).toEqual([]);
  });

  it('skips malformed JSON files without throwing', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['valid.json', 'broken.json'] as any);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(VALID_ITEM as any)
      .mockResolvedValueOnce('{ invalid json' as any);

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getAll();

    expect(items).toHaveLength(1);
  });

  it('finds content by slug', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['hello-world.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(VALID_ITEM as any);

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const item = await adapter.getBySlug('hello-world');

    expect(item?.slug).toBe('hello-world');
  });

  it('returns null for a missing slug', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce([] as any);

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const item = await adapter.getBySlug('nonexistent');

    expect(item).toBeNull();
  });

  it('filters by content type', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['hello-world.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(VALID_ITEM as any);

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getByType('posts');

    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe('posts');
  });

  it('returns empty array when type directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getByType('nonexistent');

    expect(items).toEqual([]);
  });

  it('passes status field through from JSON', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['posts'] as any)
      .mockResolvedValueOnce(['draft.json'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ id: 'draft', slug: 'draft', title: 'Draft', body: '', contentType: 'posts', status: 'draft' }) as any
    );

    const adapter = new JsonAdapter({ contentDir: '/fake/content' });
    const items = await adapter.getAll();

    expect(items[0].status).toBe('draft');
  });
});
