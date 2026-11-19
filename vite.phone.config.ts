/** Builds the phone-only app (phone/) into docs/, which GitHub Pages serves. */
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'phone'),
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  build: { outDir: resolve(__dirname, 'docs'), emptyOutDir: true, target: 'es2020' },
});
