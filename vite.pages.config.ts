import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function reviewBuildId() {
  const hash = createHash('sha256');
  for (const directory of ['app/forest', 'public/textures']) {
    for (const file of (readdirSync(directory, { recursive: true }) as string[]).sort()) {
      if (!/\.(ts|js|png|jpe?g|webp)$/i.test(file)) continue;
      hash.update(`${directory}/${file}`).update(readFileSync(`${directory}/${file}`));
    }
  }
  return `forest-${hash.digest('hex').slice(0, 16)}`;
}

export default defineConfig({
  root: resolve('pages'),
  publicDir: resolve('public'),
  base: process.env.PAGES_BASE || '/',
  plugins: [react()],
  define: { __FOREST_REVIEW_BUILD__: JSON.stringify(reviewBuildId()) },
  build: {
    outDir: resolve('dist-pages'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: resolve('pages/index.html'),
        review: resolve('pages/spatial-review/index.html'),
      },
    },
  },
});
