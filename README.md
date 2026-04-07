# Invert

A database-less, adapter-driven content presentation layer built on Astro. Invert renders content from any source — JSON files, markdown, a WordPress site, a Drupal site, an AI tool over MCP — without an admin panel, without a database, and without opinions about where your content lives.

There is no admin. That's the point. If there's no admin, then the admin can be anything.

## Philosophy

The presentation layer and the content management layer are separate concerns. Conflating them is the mistake the industry keeps making.

Invert doesn't replace your CMS. It sits in front of it — or in front of no CMS at all. Content comes in from adapters, gets normalized into a common JSON shape, and gets rendered. Where the content comes from is not Invert's problem. That's yours.

You can use WordPress and keep your admin panel. You can commit markdown to a git repo. You can talk to an AI tool over MCP and let it create content as JSON files. You can do all three at the same time. The choice is yours.

An [inversion](https://en.wikipedia.org/wiki/Inversion_(circus_arts)) is when you flip yourself upside down — a fundamental move in aerial arts. You hold your whole body weight in your hands while you rotate 180 degrees. It's a test of grip and strength. In this context, Invert means: look at the same stuff from a different angle. We don't have to throw our toys away. We can have new things and still honor the old things.

## Quick Start

1. Click **"Use this template"** on GitHub to create your own repository
2. Clone your new repo locally
3. Install dependencies:

```bash
npm install
```

4. Start the dev server:

```bash
npm run dev
```

Your site is running at `http://localhost:4321` with example content.

## Adding Content

### JSON Files

Drop `.json` files into the `content/` directory. Subdirectories map to content types.

```
content/
  posts/
    hello-world.json
    my-second-post.json
  pages/
    about.json
```

A content file looks like this:

```json
{
  "id": "hello-world",
  "slug": "hello-world",
  "title": "Hello World",
  "body": "<p>This is my first post.</p>",
  "contentType": "post",
  "date": "2026-04-06",
  "author": "Chris",
  "taxonomies": {
    "tags": ["intro", "meta"]
  }
}
```

### Markdown Files

Drop `.md` files into the `markdown/` directory (or wherever your markdown adapter is configured to look). Frontmatter maps to content fields.

```markdown
---
title: Hello World
date: 2026-04-06
contentType: post
author: Chris
tags: [intro, meta]
---

This is my first post, written in markdown.
```

### Remote Markdown (GitHub)

Point the markdown adapter at a GitHub repository and Invert will pull content from it at build time.

```typescript
// src/lib/config.ts
new MarkdownAdapter({
  source: 'github',
  repo: 'your-org/your-docs-repo',
  contentDir: 'docs',
  branch: 'main',
})
```

### MCP (AI Tools)

Start the MCP server and connect it to Claude Desktop, ChatGPT, or any MCP-compatible tool:

```bash
npm run mcp
```

The AI tool can then create, read, update, and search content directly. Write operations produce JSON files on disk that the site renders on the next build or dev server reload.

## Configuration

All configuration lives in `src/lib/config.ts`:

```typescript
import { JsonAdapter } from '../adapters/json';
import { MarkdownAdapter } from '../adapters/markdown';

export const invertConfig = {
  siteName: 'My Site',
  siteUrl: 'https://example.com',

  adapters: [
    new JsonAdapter({ contentDir: './content' }),
    new MarkdownAdapter({ source: 'local', contentDir: './markdown' }),
  ],
};
```

Multiple adapters can run simultaneously. Content is merged from all sources at build time.

## Content Shape

All content from all adapters normalizes to this shape:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier |
| `slug` | string | yes | URL-friendly identifier |
| `title` | string | yes | Display title |
| `body` | string | yes | HTML content |
| `contentType` | string | yes | e.g., "post", "page" |
| `date` | string | no | ISO 8601 date |
| `modified` | string | no | ISO 8601 date |
| `author` | string | no | Author name |
| `excerpt` | string | no | Short summary |
| `featuredImage` | string | no | URL or path to image |
| `taxonomies` | object | no | e.g., `{ tags: ["a", "b"] }` |
| `meta` | object | no | Arbitrary metadata |

Content types are just strings. There's no structural difference between a "post" and a "page" and a "recipe." The system doesn't enforce schemas — that's the adapter's job if it wants to.

## Routing

- `/` — Homepage, recent content from all adapters
- `/[type]/` — All content of a given type (e.g., `/posts/`)
- `/[type]/[slug]` — Individual content item (e.g., `/posts/hello-world`)

## MCP Server

Invert includes a Model Context Protocol server for AI tool integration.

### Read Tools

| Tool | Description |
|------|-------------|
| `invert_list` | List content, optionally filtered by type |
| `invert_get` | Get a single content item by type and slug |
| `invert_search` | Full-text search across title, body, excerpt |
| `invert_types` | List all available content types |

### Write Tools

| Tool | Description |
|------|-------------|
| `invert_create` | Create a new content item (writes JSON to disk) |
| `invert_update` | Update an existing content item |
| `invert_delete` | Delete a content item |

Write operations create or modify JSON files in the `content/` directory. Changes appear on the site after a rebuild or immediately in dev mode with hot reload.

## Adapters

### Available Now

- **JSON** — Reads `.json` files from a local directory
- **Markdown** — Reads `.md` files with YAML frontmatter from a local directory or a GitHub repository
- **MCP** — Bidirectional: AI tools can read and write content

### Planned

- **WordPress REST API** — Fetch content from a WordPress site
- **Drupal JSON:API** — Fetch content from a Drupal site
- **Content Publisher** — Pantheon Content Publisher for Google Docs workflows
- **RSS/Atom** — Read feed entries as content
- **Generic HTTP** — Configurable adapter for any JSON API

### Writing Your Own Adapter

Implement the `InvertAdapter` interface:

```typescript
import type { InvertAdapter, InvertContent } from './interface';

export class MyAdapter implements InvertAdapter {
  name = 'my-adapter';

  async getAll(): Promise<InvertContent[]> {
    // Fetch and normalize your content
  }

  async getBySlug(slug: string): Promise<InvertContent | null> {
    // Fetch a single item
  }

  async getByType(contentType: string): Promise<InvertContent[]> {
    // Fetch by content type
  }
}
```

Register it in `src/lib/config.ts` and you're done.

## Deployment

### Cloudflare Pages

Connect your GitHub repo to Cloudflare Pages. Build command: `npm run build`. Output directory: `dist/`.

### Other Platforms

Invert is an Astro project. It deploys anywhere Astro deploys: Netlify, Vercel, any Node.js server, or as a static site. Swap the Astro adapter in `astro.config.mjs` for your target platform.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Astro dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run mcp` | Start the MCP server |

## Project Structure

```
invert/
├── astro.config.mjs          # Astro configuration
├── CLAUDE.md                  # Claude Code conventions
├── ARCHITECTURE.md            # Full architecture reference
├── src/
│   ├── adapters/              # Content source adapters
│   │   ├── interface.ts       # InvertAdapter + InvertContent types
│   │   ├── json.ts            # JSON file adapter
│   │   ├── markdown.ts        # Markdown adapter (local + GitHub)
│   │   └── mcp.ts             # MCP server adapter
│   ├── lib/
│   │   ├── config.ts          # Site config + adapter registration
│   │   └── content.ts         # Content query helpers
│   ├── layouts/
│   │   └── Base.astro         # Base HTML layout
│   ├── pages/
│   │   ├── index.astro        # Homepage
│   │   ├── [type]/
│   │   │   ├── index.astro    # Content type listing
│   │   │   └── [slug].astro   # Individual content page
│   │   └── 404.astro          # Not found
│   └── components/
│       ├── ContentCard.astro  # Listing card component
│       └── ContentBody.astro  # Content body renderer
├── mcp/
│   ├── server.ts              # MCP server entry point
│   └── tools.ts               # MCP tool definitions
├── content/                   # JSON content files
│   └── posts/
│       └── hello-world.json
└── markdown/                  # Markdown content files
```

## License

MIT

## Author

[Chris Reynolds](https://next.jazzsequence.com) ([@jazzsequence](https://github.com/jazzsequence))