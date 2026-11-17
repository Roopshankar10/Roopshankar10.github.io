// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// User site (repo name = Roopshankar10.github.io), so it's served from the root: no `base` needed.
export default defineConfig({
  site: 'https://roopshankar10.github.io',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'auto' },
  vite: { plugins: [tailwindcss()] },
});
