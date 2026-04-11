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

Both expose the same 8 tools. Which one you use depends on where you're working.

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

When deployed to Cloudflare Pages, your site exposes an MCP server at `/api/mcp`. This uses the [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) and is accessible from Claude Code, Claude Desktop, or any MCP client.

See [Cloudflare Pages deployment](cloudflare-pages) for the full setup guide. Once deployed:

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

Both servers expose the same tools:

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
invert_create(id, slug, title, body, contentType, date?, author?, excerpt?, ...)
```

Local: writes `content/{contentType}/{slug}.json` to disk.
Edge: writes to Cloudflare KV immediately, commits to GitHub asynchronously.

### invert_update

Update fields on an existing content item.

```
invert_update(contentType: string, slug: string, updates: Partial<InvertContent>)
```

### invert_delete

Delete a content item.

```
invert_delete(contentType: string, slug: string)
```

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

## Write durability (edge)

Edge writes go to **Cloudflare KV first** — content is readable immediately. An async GitHub API commit then syncs the change back to the git repo, which triggers a GitHub Actions rebuild (~1-2 minutes). If the GitHub token is not configured, content lives only in KV and will be lost on the next full rebuild.
