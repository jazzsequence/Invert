---
title: Deploying to Cloudflare Pages
slug: cloudflare-pages
contentType: docs
date: 2026-04-08
excerpt: How to deploy an Invert site to Cloudflare Pages using Wrangler CLI, including the native HTTP MCP server with KV-backed writes.
---

# Deploying to Cloudflare Pages

Cloudflare Pages hosts your static Invert site and runs the MCP server at the edge via a Pages Function. Once deployed, AI tools can connect to your site's `/api/mcp` endpoint directly — no local process required.

> **Use Wrangler CLI for setup.** The Cloudflare dashboard UI for connecting a GitHub repository is unreliable. The CLI approach below works consistently.

## What you get

- Static Astro site on a `*.pages.dev` domain (or custom domain)
- `/api/mcp` — the full Invert MCP server running at the edge, all 7 tools
- **Writes land in Cloudflare KV immediately** — readable by the MCP at once
- **Async GitHub commit** — git stays in sync, GitHub Actions rebuilds the static site (~1-2 min delay for web pages)

## How the write model works

```
AI tool → invert_create → KV (instant) → MCP reads reflect it immediately
                        → GitHub API commit (async) → Actions rebuild → static site updated
```

Read operations merge two sources — KV (freshest) and the static manifest (`dist/_api/content.json`) — with KV winning on any conflict.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- Your site repository on GitHub
- Node.js 22+

---

## Step 1 — Authenticate with Cloudflare

```bash
npx wrangler login
```

Opens a browser to authorize Wrangler. Return to the terminal when done.

## Step 2 — Create the Pages project

```bash
npx wrangler pages project create YOUR-PROJECT-NAME --production-branch main
```

Cloudflare assigns a `*.pages.dev` domain — note it for Step 5.

## Step 3 — Create the KV namespace

```bash
npx wrangler kv namespace create CONTENT
```

Wrangler will ask a few questions:

- **Would you like Wrangler to add it on your behalf?** → `Y` (lets Wrangler update `wrangler.jsonc` automatically)
- **What binding name would you like to use?** → `CONTENT` (press Enter to confirm)
- **For local dev, do you want to connect to the remote resource instead of a local resource?** → `N` (local dev uses a local KV store so you don't touch production data)

If you chose `Y` to let Wrangler update the config, `wrangler.jsonc` is already updated. If you skipped it, paste the ID manually:

```jsonc
"kv_namespaces": [
  {
    "binding": "CONTENT",
    "id": "YOUR_KV_NAMESPACE_ID_HERE"
  }
]
```

## Step 4 — Build the site

```bash
npm run build
```

Runs `astro build` then `scripts/generate-manifest.mjs`, which writes `dist/_api/content.json` — the static content manifest used as a read fallback by the edge MCP.

## Step 5 — Set SITE_URL and rebuild

```bash
SITE_URL=https://your-project.pages.dev npm run build
```

Replace with your assigned domain from Step 2.

## Step 6 — Deploy

```bash
npx wrangler pages deploy dist/
```

Uploads the static site and the Pages Function (`functions/api/mcp.ts`) together.

## Step 7 — Set environment variables in Cloudflare

Go to **Cloudflare dashboard → Workers & Pages → your project → Settings → Variables**.

Add the following:

| Variable | Value | Notes |
|---|---|---|
| `GITHUB_TOKEN` | GitHub PAT | Needs Contents: read & write on the repo |
| `GITHUB_REPO` | `owner/repo` | e.g. `jazzsequence/dragonfly` |
| `GITHUB_BRANCH` | `main` | Or your production branch |

**Creating a GitHub PAT (fine-grained token):**

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click **Generate new token**
3. Under "Repository access", select your site repo
4. Under "Repository permissions", set **Contents** to **Read and write**
5. Generate and copy the token

Without `GITHUB_TOKEN`, write tools still work but content lives only in KV — it will not survive a full site rebuild from git.

## Step 8 — Set up automated deployments (GitHub Actions)

Future deploys run automatically on push to `main`.

**Get your Account ID:**

```bash
npx wrangler whoami
```

The account ID is in the output.

**Create a Cloudflare API token:**

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → **Create Custom Token**
3. Give it a name (e.g. "Dragonfly Pages Deploy")
4. Under **Permissions**, add:
   - Account → Cloudflare Pages → Edit
5. Under **Account Resources**, select your account
6. Click **Continue to summary** → **Create Token** and copy it

**Add to GitHub** (repo → Settings → Secrets and variables → Actions):

- Secret: `CLOUDFLARE_API_TOKEN`
- Secret: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `SITE_URL` = `https://your-project.pages.dev`

The workflow at `.github/workflows/deploy-cloudflare.yml` handles the rest.

---

## Connecting the MCP server

Add to your MCP client config (`~/.claude/mcp.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "my-site": {
      "url": "https://your-project.pages.dev/api/mcp"
    }
  }
}
```

All 7 tools are available: `invert_list`, `invert_get`, `invert_search`, `invert_types`, `invert_create`, `invert_update`, `invert_delete`.

You can verify the server at `GET /api/mcp` — it returns a JSON summary including whether GitHub sync is configured.

---

## Local preview with Wrangler

```bash
npm run build
npx wrangler pages dev dist/
```

Starts a local server at `http://localhost:8788` with the static site and MCP function running together. The MCP endpoint is at `http://localhost:8788/api/mcp`.

Note: local KV uses a Wrangler-managed SQLite store. Data written locally does not affect your production KV namespace.

## Custom domain

1. Cloudflare dashboard → your project → **Custom domains** → add your domain
2. Follow the DNS instructions
3. Update `SITE_URL` in GitHub repository variables
4. Trigger a redeploy
