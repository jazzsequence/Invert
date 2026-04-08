/**
 * src/pages/api/mcp/info.ts — Human-readable MCP server status
 * Accessible at /api/mcp/info
 */

// prerender = true when building for static hosts (e.g. GitHub Pages).
// Set DEPLOY_TARGET=cloudflare to keep this as an SSR route.
export const prerender = import.meta.env.DEPLOY_TARGET !== 'cloudflare';

import type { APIContext } from 'astro';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET({ locals }: APIContext): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (locals as any).runtime?.env ?? {};

  return new Response(
    JSON.stringify({
      name: env.SITE_NAME ?? 'invert',
      version: '0.1.0',
      transport: 'http',
      mcpEndpoint: '/api/mcp',
      tools: ['invert_list', 'invert_get', 'invert_search', 'invert_types', 'invert_create', 'invert_update', 'invert_delete'],
      writeSync: !!(env.GITHUB_TOKEN && env.GITHUB_REPO),
    }, null, 2),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
}
