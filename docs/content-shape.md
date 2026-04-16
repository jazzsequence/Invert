---
title: Content Shape
slug: content-shape
contentType: docs
date: 2026-04-06
excerpt: The InvertContent interface — the normalized shape all adapters produce.
---

# Content Shape

All content in Invert normalizes to a single `InvertContent` interface defined in `src/adapters/interface.ts`. Adapters are responsible for mapping their source format to this shape. The renderer and router only depend on the required fields.

## InvertContent

```typescript
interface InvertContent {
  // Required
  id: string;           // Unique identifier (adapter-determined)
  slug: string;         // URL-friendly identifier — used in routing
  title: string;        // Display title
  body: string;         // HTML string — adapters convert markdown, etc.
  contentType: string;  // e.g. "posts", "pages", "docs"

  // Optional
  date?: string;        // ISO 8601 date string
  modified?: string;    // ISO 8601 date string
  author?: string;      // Author name or identifier
  excerpt?: string;     // Short summary — used for og:description
  featuredImage?: string;                    // URL or relative path — used for og:image
  taxonomies?: Record<string, string[]>;     // e.g. { tags: ["astro"] }
  meta?: Record<string, unknown>;            // Arbitrary pass-through data
  status?: 'draft' | 'published';           // undefined treated as published
}
```

## Content types are strings

There is no structural distinction between a "post" and a "page" and a "recipe". A content type is a string. Directory structure can optionally mirror content types (e.g. `content/posts/`) but this is convention, not architecture. The system does not enforce schemas per content type — that's the adapter's job if it wants to.

## Routing

Content is routed by `contentType` and `slug`:

- `/posts/my-post` → `{ contentType: "posts", slug: "my-post" }`
- `/docs/getting-started` → `{ contentType: "docs", slug: "getting-started" }`
- `/pages/about` → `{ contentType: "pages", slug: "about" }`

Listing pages at `/{type}/` show all content of that type.

## The body field

The `body` field must be an HTML string. Adapters that read Markdown must convert it to HTML before returning it. The `ContentBody` component renders it with `set:html`.

If your adapter reads from an API that returns Markdown, convert it with remark/rehype before returning. If it returns HTML directly (e.g. WordPress REST API), pass it through as-is.

## Draft content

Set `status: "draft"` on any content item to exclude it from the public site. Draft content is not built at its canonical URL (`/[type]/[slug]`) and is invisible to all content API functions by default.

Draft content is accessible at `/preview/[type]/[slug]` with a visible draft banner and `noindex` meta. On Cloudflare Pages this is served by a dynamic Pages Function reading from KV — no rebuild required. Share the URL for review before publishing.

To publish a draft: if you created it via the MCP, call `invert_publish(contentType, slug)`. If you created it by hand (JSON or markdown file), change `status` to `"published"` or remove the field.

```json
{
  "id": "my-draft",
  "slug": "my-draft",
  "title": "Work in Progress",
  "contentType": "posts",
  "body": "<p>...</p>",
  "status": "draft"
}
```

## Social / OG meta

`excerpt` maps to `og:description` and `meta[name="description"]`. `featuredImage` maps to `og:image` and `twitter:image`. Both are optional — if absent the relevant tags are omitted.

The canonical URL and `og:url` are derived automatically from `Astro.site` + the current pathname. Configure `SITE_URL` in your environment or `astro.config.mjs` to produce correct canonical URLs.

## Using meta

The `meta` field is an escape hatch for data that doesn't fit the standard shape. Templates can read from `content.meta` for source-specific fields without breaking the interface contract.

```json
{
  "id": "my-post",
  "slug": "my-post",
  "title": "My Post",
  "contentType": "posts",
  "body": "<p>...</p>",
  "meta": {
    "wordpressId": 42,
    "acf": { "custom_field": "value" }
  }
}
```
