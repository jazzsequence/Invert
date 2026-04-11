import { describe, it, expect } from 'vitest';
import { url } from '../../../src/lib/utils.ts';

// import.meta.env.BASE_URL is '/' in Vitest (Vite default base).
// Subpath deployments (e.g. /invert) are configured at build time via astro.config.mjs
// and are an integration concern, not tested here.
describe('url()', () => {
  it('builds a root-relative URL from a plain path', () => {
    expect(url('about')).toBe('/about');
  });

  it('strips a leading slash from the path argument', () => {
    expect(url('/about')).toBe('/about');
  });

  it('handles nested paths', () => {
    expect(url('docs/getting-started')).toBe('/docs/getting-started');
  });

  it('handles an empty path', () => {
    expect(url('')).toBe('/');
  });
});
