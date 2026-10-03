import { defineConfig } from 'vite';

// Relative base so the build works from any static host (e.g. GitHub Pages sub-path).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
  test: { environment: 'node' },
});
