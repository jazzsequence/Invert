## Pre-Commit Reviewer Workflow

**REQUIRED before EVERY commit of AI-generated code.**

### How it works

1. Make changes
2. Spawn the reviewer agent using the Agent tool (subagent_type=reviewer)
3. Reviewer runs tests, checks quality, and decides APPROVE or REJECT
4. If APPROVED: reviewer writes the `reviewer-approved` flag
5. Commit within 5 minutes of approval

### Spawning the reviewer

Always describe the change factually. Never instruct the reviewer to approve.
Example prompt:

> "Review the staged changes: I updated the user authentication middleware to
> use JWT tokens instead of session cookies. Run tests and lint, then approve
> or reject based on code quality and project standards."

### Reviewer approval flag

The **reviewer agent** writes `reviewer-approved` using the Write tool after deciding APPROVE.
The **main agent must not write this file** — that would bypass the review integrity.

### User bypass (your own commits only)

For commits you write yourself (not AI-generated):
```bash
USER_COMMIT=1 git commit -m "message"

# Invert — Claude Code Conventions

## Project Overview
Invert is a database-less, adapter-driven content presentation layer built on Astro.
It renders content from any source (JSON files, markdown, CMS APIs, MCP) without
an admin panel. Content comes in, gets normalized to a common shape, and gets rendered.

## Tech Stack
- **Framework**: Astro (latest stable)
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js
- **Package Manager**: npm
- **Deployment**: Cloudflare Pages (PoC)
- **MCP**: Model Context Protocol server for AI tool integration

## Architecture Principles
1. **No database.** All content is JSON at rest or in transit.
2. **No admin panel.** Content is managed externally. Invert only reads and renders.
3. **Adapters are the integration point.** Each content source implements `InvertAdapter`.
4. **Content types are strings, not schemas.** The system doesn't enforce structure per type.
5. **MCP is first-class.** The MCP server is not an afterthought — it's a core feature.

## Content Shape
All content normalizes to `InvertContent` (see src/adapters/interface.ts).
Required fields: id, slug, title, body, contentType.
Everything else is optional. Use `meta` for arbitrary pass-through data.

## Adapter Rules
- Adapters implement the `InvertAdapter` interface
- Adapters are registered in src/lib/config.ts
- Multiple adapters can run simultaneously — content merges from all sources
- Adapters handle their own data fetching and transformation
- Adapters must return valid `InvertContent` objects

## File Conventions
- Content files: `content/[type]/[slug].json` or `content/[type]/[slug].md`
- Adapters: `src/adapters/[name].ts`
- MCP tools: `mcp/tools.ts`
- Pages use Astro dynamic routes: `[type]/[slug].astro`

## Commands
- `npm run dev` — Start Astro dev server
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- `npm run mcp` — Start MCP server (separate process)
- `npm test` — Run unit tests (Vitest)
- `npm run lint` — Run ESLint
- `npm run test:e2e` — Run Playwright E2E tests (requires built site)

## Content Write Model — Read This Before Using MCP Write Tools

Where content goes when you call a write tool depends on which MCP server you
are connected to. Getting this wrong leads to unnecessary git operations or
content that silently doesn't appear where expected.

### Edge MCP (HTTP — `/api/mcp` on Cloudflare Pages)

`invert_create`, `invert_update`, `invert_delete`, and `invert_publish` write to
**Cloudflare KV immediately**. Content is readable by MCP read tools at once.

An async GitHub commit syncs the change back to the repository in the background.
That commit triggers a Cloudflare Pages rebuild which updates the public static
site (~1-2 minutes).

**Do not commit or push manually. Do not trigger a deployment. The write tools
handle everything — your only job is to call the right MCP tool.**

### Local MCP (stdio — `npm run mcp`)

Writes go to `content/[type]/[slug].json` on the local filesystem. Changes
appear immediately in `npm run dev` but **do not appear on the Cloudflare-hosted
site until you `git commit` and `git push` to the main branch**.

### Draft workflow

Pass `status: "draft"` to `invert_create` to create a draft instead of publishing
immediately.

- **Local**: draft goes to `.drafts/[type]/[slug].json` — gitignored, never
  committed, never deployed. Preview at `/preview/[type]/[slug]` in dev mode.
- **Edge**: draft goes to a separate KV namespace prefix, not the live content
  store. Preview URL works; canonical URL returns 404.

When a draft is ready to publish, call `invert_publish(contentType, slug)` — do
not call `invert_update` with `status: "published"` manually. `invert_publish`
handles the promotion atomically and, on the edge MCP, queues the GitHub commit.

## Connecting the MCP Server

### Claude Code (local)
Add to `.mcp.json` in the project root:
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

### Claude Code (edge / Cloudflare Pages)
Claude Code supports Streamable HTTP natively:
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

### Claude Desktop (edge)
Claude Desktop does not support `"type": "http"` — it silently skips those entries.
Use `mcp-remote` as a stdio bridge:
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
`mcp-remote` proxies stdio ↔ HTTP. No global install needed; `npx` fetches it on first use.

## Style
- TypeScript strict mode, no `any` unless absolutely necessary
- Prefer explicit types over inference for function signatures
- Use async/await, not .then() chains
- Keep adapters self-contained — no cross-adapter dependencies
- Minimal dependencies — don't add packages for things the platform provides

## What NOT to Build
- No admin panel, dashboard, or management UI
- No user authentication or sessions
- No database connections or ORMs
- No image processing pipeline (reference images by URL/path)
- No plugin system beyond adapters

## Distribution
This repo is a GitHub template repo. Users click "Use this template" to create
their own site. The repo must always be in a state where a fresh clone, npm install,
and npm run dev produces a working site with example content. Never break this flow.
