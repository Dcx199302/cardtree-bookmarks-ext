import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, cpSync, existsSync } from 'fs';
import { resolve } from 'path';

const projectRoot = resolve(import.meta.dirname);

const targetBrowser = process.env.TARGET_BROWSER ?? 'chrome';

// 根据目标浏览器生成 manifest.json
function writeManifest() {
  const manifest = JSON.parse(
    readFileSync(resolve(projectRoot, 'manifest.json'), 'utf-8'),
  );

  if (targetBrowser === 'firefox') {
    // Firefox 不支持 Chrome 私有的 favicon 权限
    manifest.permissions = manifest.permissions.filter(
      (p: string) => p !== 'favicon',
    );
    manifest.browser_specific_settings = {
      gecko: {
        id: 'cardtree@cardtree.app',
        strict_min_version: '109.0',
      },
    };
  }

  writeFileSync(
    resolve(projectRoot, 'dist/manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
}

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
        writeManifest();
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
