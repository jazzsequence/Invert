---
title: Content API
slug: content-api
contentType: docs
date: 2026-04-08
excerpt: The src/lib functions for fetching and querying content inside Astro pages and components.
---

# Content API

`src/lib/content.ts` provides the functions you call inside Astro pages and components to fetch content across all registered adapters. You don't interact with adapters directly — these functions merge and deduplicate output from all of them.

## How merging works

When you call any of these functions, every registered adapter runs in parallel. Results are merged in adapter registration order: if two adapters return content with the same `contentType` + `slug`, the first adapter wins. The merged result is sorted by `date` descending.

## Functions

### getAllContent

Returns every content item from every adapter, merged and sorted.

```typescript
import { getAllContent } from '../lib/content';

const all = await getAllContent();
```

Use this for index pages, sitemaps, feeds, or any page that lists across types.

### getContentByType

Returns all content items matching a specific `contentType`, sorted by date descending.

```typescript
import { getContentByType } from '../lib/content';

const posts = await getContentByType('posts');
```

Use this for type-scoped index pages (`/posts`, `/docs`, etc.).

### getContentBySlug

Returns a single content item by `contentType` and `slug`. Returns `null` if not found.

```typescript
import { getContentBySlug } from '../lib/content';

const post = await getContentBySlug('posts', 'hello-world');
if (!post) return Astro.redirect('/404');
```

Use this in dynamic routes (`[type]/[slug].astro`) to resolve the current page.

### getContentTypes

Returns the distinct set of `contentType` values present across all content.

```typescript
import { getContentTypes } from '../lib/content';

const types = await getContentTypes();
// e.g. ["posts", "pages", "docs"]
```

Use this to generate navigation, or to drive `getStaticPaths` for type-level index routes.

### searchContent

Full-text search across `title`, `body`, and `excerpt` for all content.

```typescript
import { searchContent } from '../lib/content';

const results = await searchContent('astro');
```

Case-insensitive. Runs in memory against the merged content set — not suited for large datasets, but works well for typical static sites.

## Usage in getStaticPaths

These functions are the standard way to drive Astro's static path generation:

```typescript
// src/pages/[type]/[slug].astro
export async function getStaticPaths() {
  const all = await getAllContent();
  return all.map((item) => ({
    params: { type: item.contentType, slug: item.slug },
    props: { content: item },
  }));
}
```

---

# URL Utility

`src/lib/utils.ts` exports a single helper for generating site-root-relative URLs that respect the configured `base` path.

## url

Builds a path relative to the site root, handling both root deployments (`/`) and subpath deployments (`/invert`).

```typescript
import { url } from '../lib/utils';

url('docs/getting-started')     // → "/docs/getting-started"   (root deploy)
url('docs/getting-started')     // → "/invert/docs/getting-started"  (subpath deploy)
url('/posts/hello-world')       // leading slash is safe, stripped internally
```

Use this wherever you construct internal hrefs — in layouts, navigation components, and anywhere you'd otherwise hardcode a path.

```astro
---
import { url } from '../lib/utils';
---
<a href={url('posts')}>All posts</a>
```

The base path is read from `import.meta.env.BASE_URL`, which Astro sets at build time from the `base` option in `astro.config.mjs`.
