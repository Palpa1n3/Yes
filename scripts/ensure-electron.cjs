/* Ensures Electron's binary is downloaded. Some npm configurations skip dependency
 * install scripts, which leaves node_modules/electron without its program files and
 * makes `npm run dev` fail with "Electron uninstall". Safe to run repeatedly. */
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = join(__dirname, '..', 'node_modules', 'electron');
if (!existsSync(dir)) process.exit(0); // not installed yet (e.g. production-only install)

const pathFile = join(dir, 'path.txt');
const binary = existsSync(pathFile)
  ? join(dir, 'dist', readFileSync(pathFile, 'utf8').trim())
  : null;
if (binary && existsSync(binary)) process.exit(0);

console.log('[arc] Downloading the Electron binary…');
const r = spawnSync(process.execPath, [join(dir, 'install.js')], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error(
    '[arc] Electron download failed. Check your connection or firewall, then run: npm run setup:electron',
  );
  process.exit(r.status ?? 1);
}
console.log('[arc] Electron is ready.');
