import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import * as fs from 'node:fs/promises';
import { MarkdownAdapter } from '../../../src/adapters/markdown.ts';

const WITH_FRONTMATTER = `---
title: Test Post
slug: test-post
contentType: posts
date: 2026-01-01
author: Test Author
excerpt: A test excerpt
tags: [foo, bar]
---
# Test Post

Body content here.
`;

const WITHOUT_FRONTMATTER = `# Simple Post

No frontmatter here.
`;

const MINIMAL_FRONTMATTER = `---
title: Minimal
---
Body only.
`;

describe('MarkdownAdapter (local)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('parses frontmatter fields into InvertContent', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['test-post.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(WITH_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getAll();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test Post');
    expect(items[0].slug).toBe('test-post');
    expect(items[0].contentType).toBe('posts');
    expect(items[0].date).toBe('2026-01-01');
    expect(items[0].author).toBe('Test Author');
    expect(items[0].excerpt).toBe('A test excerpt');
    expect(items[0].taxonomies?.tags).toEqual(['foo', 'bar']);
  });

  it('converts markdown body to HTML', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['test-post.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(WITH_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getAll();

    expect(items[0].body).toContain('<h1>');
    expect(items[0].body).toContain('Body content here');
  });

  it('falls back to filename as slug when frontmatter omits it', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['simple-post.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(WITHOUT_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getAll();

    expect(items[0].slug).toBe('simple-post');
  });

  it('defaults contentType to "post" when frontmatter omits it', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['minimal.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(MINIMAL_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getAll();

    expect(items[0].contentType).toBe('post');
  });

  it('ignores non-.md files', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['post.md', 'data.json', 'README.txt'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(MINIMAL_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getAll();

    expect(items).toHaveLength(1);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when directory does not exist', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/nonexistent' });
    const items = await adapter.getAll();

    expect(items).toEqual([]);
  });

  it('finds content by slug', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['test-post.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(WITH_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const item = await adapter.getBySlug('test-post');

    expect(item?.slug).toBe('test-post');
  });

  it('returns null for a missing slug', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const item = await adapter.getBySlug('nonexistent');

    expect(item).toBeNull();
  });

  it('filters by content type', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['test-post.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(WITH_FRONTMATTER as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getByType('posts');

    expect(items).toHaveLength(1);
    expect(items[0].contentType).toBe('posts');
  });

  it('passes status field through from frontmatter', async () => {
    const draftMarkdown = `---
title: Draft Post
slug: draft-post
status: draft
---
Body content.
`;
    vi.mocked(fs.readdir).mockResolvedValue(['draft-post.md'] as any);
    vi.mocked(fs.readFile).mockResolvedValue(draftMarkdown as any);

    const adapter = new MarkdownAdapter({ source: 'local', contentDir: '/fake' });
    const items = await adapter.getAll();

    expect(items[0].status).toBe('draft');
  });
});
