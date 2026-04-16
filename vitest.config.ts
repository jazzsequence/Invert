import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts', 'mcp/**/*.ts', 'cloudflare/**/*.ts'],
      // Config and server entry points have no testable logic of their own
      exclude: ['src/lib/config.ts', 'mcp/server.ts'],
    },
  },
});
