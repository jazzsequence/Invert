---
title: MCP Server
slug: mcp
contentType: docs
date: 2026-04-06
excerpt: The built-in Model Context Protocol server — read and write content from AI tools.
---

# MCP Server

Invert ships with two MCP (Model Context Protocol) servers:

- **Local (stdio)** — runs on your machine during development, reads and writes files directly
- **Edge (HTTP)** — runs on Cloudflare Pages, readable and writable from anywhere via the deployed URL

Both expose the same core tools. Which one you use depends on where you're working.

## Local MCP server

Start alongside your dev server:

```bash
npm run mcp
```

The server runs on stdio. It reads content from your local `content/` directory and writes JSON files directly to disk. Changes appear immediately in dev mode.

### Connecting to Claude Code (local)

Add to your project `.mcp.json`:

```json
{
  "mcpServers": {
    "invert": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/your/invert/site"
    }
  }
}
```

### Connecting to Claude Desktop (local)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "invert": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/path/to/your/invert/site"
    }
  }
}
```

Restart Claude Desktop after saving.

## Edge MCP server (Cloudflare Pages)

> **Setup required**: The edge MCP server uses [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/) and works with `output: 'static'` — no SSR needed. Copy `cloudflare/api/mcp/` to `functions/api/mcp/` in your project, configure your KV namespace and GitHub vars in `wrangler.jsonc`, then deploy. See [Cloudflare Pages deployment](cloudflare-pages).

When deployed to Cloudflare Pages, your site exposes an MCP server at `/api/mcp`. This uses the [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) and is accessible from Claude Code, Claude Desktop, or any MCP client.

Once deployed:

### Connecting to Claude Code (edge)

Claude Code supports Streamable HTTP natively. Add to your project `.mcp.json`, or run:

```bash
claude mcp add --transport http my-site https://your-project.pages.dev/api/mcp
```

Or manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "my-site": {
      "type": "http",
      "url": "https://your-project.pages.dev/api/mcp"
    }
  }
}
```

The `"type": "http"` field is required — without it Claude Code won't connect.

### Connecting to Claude Desktop (edge)

Claude Desktop does not support `"type": "http"` MCP entries — it silently skips them. Use [mcp-remote](https://www.npmjs.com/package/mcp-remote) as a stdio bridge instead:

```json
{
  "mcpServers": {
    "my-site": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-project.pages.dev/api/mcp"]
    }
  }
}
```

`mcp-remote` proxies the stdio transport that Claude Desktop expects to your HTTP endpoint. No global install needed — `npx` fetches it on first use.

Restart Claude Desktop after saving.

### Verifying the edge server

`GET /api/mcp` returns `405` — that's correct per the MCP spec. For a human-readable status page:

```
https://your-project.pages.dev/api/mcp/info
```

Returns tool names and whether GitHub write-back sync is configured.

## Tools

Both servers expose the same core tools. The local server additionally exposes `invert_normalize_and_create` for importing content from external sources — this is local-only since it requires direct filesystem access.

### invert_list

List content items, optionally filtered by type.

```
invert_list(contentType?: string, limit?: number, offset?: number)
```

### invert_get

Get a single content item by type and slug.

```
invert_get(contentType: string, slug: string)
```

### invert_search

Full-text search across all content (searches `title`, `body`, and `excerpt`).

```
invert_search(query: string)
```

### invert_types

List all available content types.

```
invert_types()
```

### invert_create

Create a new content item.

```
invert_create(id, slug, title, body, contentType, status?, date?, author?, excerpt?, ...)
```

The optional `status` field controls where the content is stored:

| `status` | Local | Edge |
|---|---|---|
| `"draft"` | `.drafts/{type}/{slug}.json` (gitignored) | Draft KV prefix — no GitHub commit |
| `"published"` or omitted | `content/{type}/{slug}.json` | Live KV + async GitHub commit |

Draft content is only accessible via MCP read tools and the `/preview/{type}/{slug}` URL. It is never served at the canonical URL and never included in the static site build.

### invert_update

Update fields on an existing content item.

```
invert_update(contentType: string, slug: string, updates: Partial<InvertContent>)
```

Accepts `status` in the updates object. Changing `status` between `"draft"` and `"published"` moves the item between stores — no manual file management required.

### invert_publish

Promote a draft to published.

```
invert_publish(contentType: string, slug: string)
```

Moves the item from the draft store to the live store and sets `status: "published"`. On the edge, queues the async GitHub commit. Locally, moves the file from `.drafts/` to `content/`.

Prefer this over calling `invert_update` with `status: "published"` — it handles the promotion atomically.

Returns an error if no draft exists with that type and slug.

### invert_delete

Delete a content item.

```
invert_delete(contentType: string, slug: string)
```

Checks both the live and draft stores. On the edge, only queues a GitHub commit if the item was in the live store — deleting a draft has no GitHub side-effect.

### invert_normalize_and_create

Normalize raw content returned by a source MCP and import it as Invert content. This tool handles field mapping from WordPress and Drupal data shapes to `InvertContent` — you pass the raw object from the source, it normalizes and writes.

```
invert_normalize_and_create(raw: object, sourceType: "wordpress" | "drupal", contentType?: string)
```

`raw` is whatever the source MCP returned. `sourceType` determines the normalization mapping. `contentType` optionally overrides the type derived from the source (e.g. map a WP `"post"` to `"articles"`).

**WordPress** expects the shape returned by the WP REST API, ideally fetched with `?_embed` to include author, featured image, and taxonomy terms.

**Drupal** expects a JSON:API node resource object (`data.type`, `data.id`, `data.attributes`).

#### MCP-to-MCP import pattern

When Claude is connected to both a source MCP (e.g. a WordPress or Drupal site's MCP server) and the Invert MCP simultaneously, you can sync specific content items with a natural language instruction:

> "Pull the post about Python from myblog and add it to this Invert site."

Claude fetches the post via the source MCP, then passes the raw result to `invert_normalize_and_create`. Field mapping stays in code rather than in the AI's reasoning chain, so imports are consistent regardless of how the instruction is phrased.

Re-importing the same slug overwrites the existing file in place.

## Draft workflow

Drafts let you create and iterate on content before it is publicly visible.

```
# 1. Create a draft
invert_create({ ..., status: "draft" })

# 2. Read or iterate — only visible via MCP tools and /preview/ URL
invert_get("posts", "my-slug")
invert_update("posts", "my-slug", { body: "revised content" })

# 3. Publish when ready
invert_publish("posts", "my-slug")
```

On the **local MCP**, drafts live in `.drafts/` which is gitignored. They are never committed and never included in a Cloudflare Pages build. `npm run dev` serves them at `/preview/{type}/{slug}` for local review.

On the **edge MCP**, drafts live in a separate KV prefix. No GitHub commit is triggered. The static site rebuild cycle is not involved. When you call `invert_publish`, the item moves to the live KV namespace and the GitHub commit is queued — the static site updates in ~1-2 minutes.

## Write durability (edge)

Edge writes go to **Cloudflare KV first** — content is readable immediately. An async GitHub API commit then syncs the change back to the git repo, which triggers a GitHub Actions rebuild (~1-2 minutes). If the GitHub token is not configured, content lives only in KV and will be lost on the next full rebuild.
