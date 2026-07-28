import { defineConfig } from 'vite';

// `base` is relative so the built site works from any sub-path
// (GitHub Pages project sites, file://, a nested static host, ...).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
