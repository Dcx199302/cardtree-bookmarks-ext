import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, cpSync, existsSync } from 'fs';
import { resolve } from 'path';

const projectRoot = resolve(import.meta.dirname);

export default defineConfig({
  root: projectRoot,
  base: './',
  plugins: [
    react(),
    {
      name: 'ext-post-build',
      closeBundle() {
        const htmlPath = resolve(projectRoot, 'dist/newtab.html');
        if (!existsSync(htmlPath)) return;
        const html = readFileSync(htmlPath, 'utf-8');
        writeFileSync(htmlPath, html.replace(/ type="module" crossorigin/g, ' defer'));
        cpSync(resolve(projectRoot, 'manifest.json'), resolve(projectRoot, 'dist/manifest.json'));
        cpSync(resolve(projectRoot, 'icons'), resolve(projectRoot, 'dist/icons'), { recursive: true });
      },
    },
  ],
  build: {
    outDir: resolve(projectRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        newtab: resolve(projectRoot, 'newtab.html'),
      },
    },
  },
});
