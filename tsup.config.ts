import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    outDir: 'dist',
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: false,
    splitting: false,
    minify: true,
    treeshake: true,
    // Bundler-based consumers split the heavy dependencies themselves through the bare
    // specifiers in src/chunks, so the URL branch of the chunk loader is dropped here.
    define: { __BUGDUMP_IIFE__: 'false' },
  },
  {
    entry: { index: 'src/browser.ts' },
    outDir: 'dist',
    format: ['iife'],
    globalName: 'Bugdump',
    sourcemap: false,
    splitting: false,
    minify: true,
    treeshake: true,
    define: { __BUGDUMP_IIFE__: 'true' },
  },
  {
    // Loaded at runtime by URL, so these must be served next to dist/index.global.js under
    // exactly these names. ESM because that is what a browser `import()` expects.
    entry: {
      'bugdump-html2canvas': 'src/chunks/html2canvas.ts',
      'bugdump-replay': 'src/chunks/replay.ts',
    },
    outDir: 'dist',
    format: ['esm'],
    outExtension: () => ({ js: '.js' }),
    // tsup externalizes package.json dependencies by default; these files exist precisely to
    // carry them, so they must be bundled in.
    noExternal: ['html2canvas-pro', '@rrweb/record', '@rrweb/packer'],
    sourcemap: false,
    splitting: false,
    minify: true,
    treeshake: true,
  },
]);
