---
title: Keeping your site up to date
slug: updates
contentType: docs
date: 2026-04-16
excerpt: How to pull framework updates from the Invert template into your implementation.
---

# Keeping your site up to date

Invert is a GitHub template repo. When you create a site from it, you get a copy of the repo with its own independent git history. There is no automatic link back to the template — you need to set one up.

Two mechanisms are provided: a script for manual one-off syncs, and a GitHub Actions workflow for automated weekly PRs.

## What gets synced

Only the **framework internals** — files that Invert owns and that your implementation should not need to modify directly:

| Path | What it is |
|---|---|
| `src/adapters/` | Built-in adapters (JSON, Markdown, Docs, interface) |
| `src/lib/content.ts` | Content query layer |
| `src/lib/utils.ts` | Utility functions |
| `mcp/tools.ts` | Local MCP tool implementations |
| `mcp/server.ts` | Local MCP server |
| `functions/api/mcp/` | Edge MCP server (Cloudflare Pages Functions) |
| `scripts/` | Build scripts |

## What is never touched

These files belong to your implementation and are always left alone:

| Path | Why |
|---|---|
| `src/pages/` | Your site's page templates and homepage |
| `src/layouts/` | Your layouts |
| `src/components/` | Your components |
| `src/lib/config.ts` | Your adapter registration |
| `CLAUDE.md` | Your project-specific AI instructions |
| `content/`, `markdown/`, `docs/` | Your content |
| `tests/` | Your tests |
| `.github/workflows/` | Your CI |
| `wrangler.jsonc` | Your Cloudflare project settings |
| `.mcp.json` | Your MCP connection config |
| `package.json` | Your dependencies (shown in diff, not auto-applied) |

## Automated weekly sync (recommended)

The `.github/workflows/sync-invert.yml` workflow is included in the template. It runs every Monday at 09:00 UTC, checks whether any core files have changed upstream, and opens a pull request if they have.

No setup required — it just works. When a PR appears:

1. Review the diff
2. Check if `package.json` has new dependencies to install
3. Run `npm install && npm test` locally
4. Merge if CI passes

The workflow skips silently when there are no changes.

## Manual sync

For an on-demand sync, run the included script from your project root:

```bash
bash scripts/sync-upstream.sh
```

The script:

1. Adds `invert` as a git remote (once, then reuses it)
2. Fetches the latest `invert/main`
3. Shows a diff of what changed in core files
4. Creates a dated sync branch (`invert-sync-YYYYMMDD`)
5. Checks out the updated core files onto that branch
6. Prints the next steps

Then review, test, commit, push, and open a PR as you normally would.

```bash
# After the script runs:
git diff HEAD
npm install && npm test
git commit -m "chore: sync core files from Invert upstream"
git push origin invert-sync-YYYYMMDD
# Open PR on GitHub
```

## Overriding the upstream URL

By default both the script and the workflow pull from `https://github.com/jazzsequence/Invert.git` on `main`. You can override this with environment variables if you maintain a private fork:

```bash
INVERT_URL=https://github.com/your-org/invert-fork.git \
INVERT_BRANCH=stable \
bash scripts/sync-upstream.sh
```
