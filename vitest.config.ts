import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors the ESM build: chunks resolve through their bare specifiers rather than by URL,
  // which is the only branch that works outside a browser. See lib/core/chunk-loader.ts.
  define: { __BUGDUMP_IIFE__: 'false' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
