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

Both expose the same 7 tools. Which one you use depends on where you're working.

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

Add to your project `.mcp.json`, or run:

```bash
claude mcp add --transport http my-site https://your-project.pages.dev/api/mcp
```

Or manually:

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

The `"type": "http"` field is required.

### Connecting to Claude Desktop (edge)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

## Write durability (edge)

Edge writes go to **Cloudflare KV first** — content is readable immediately. An async GitHub API commit then syncs the change back to the git repo, which triggers a GitHub Actions rebuild (~1-2 minutes). If the GitHub token is not configured, content lives only in KV and will be lost on the next full rebuild.
