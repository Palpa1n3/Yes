/** Builds the phone-only app (phone/) into docs/, which GitHub Pages serves. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const builtAt = new Date().toISOString();

export default defineConfig({
  root: resolve(__dirname, 'phone'),
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  define: { __APP_VERSION__: JSON.stringify(version) },
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
