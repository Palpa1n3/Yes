/** Builds the phone-only app (phone/) into docs/, which GitHub Pages serves. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const builtAt = new Date().toISOString();
// Where updates come from: the same GitHub repository the PC app updates from.
const yml = readFileSync(resolve(__dirname, 'electron-builder.yml'), 'utf8');
const owner = /^\s*owner:\s*(\S+)/m.exec(yml)?.[1] ?? '';
const repo = /^\s*repo:\s*(\S+)/m.exec(yml)?.[1] ?? '';
const pagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
const apkUrl = `https://github.com/${owner}/${repo}/releases/latest/download/Alton.apk`;

export default defineConfig({
  root: resolve(__dirname, 'phone'),
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __PAGES_URL__: JSON.stringify(pagesUrl),
    __APK_URL__: JSON.stringify(apkUrl),
  },
  plugins: [
    {
      // The phone app checks this to offer "Update ready".
      name: 'alton-version',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version, builtAt }),
        });
      },
    },
  ],
  build: { outDir: resolve(__dirname, 'docs'), emptyOutDir: true, target: 'es2020' },
});
