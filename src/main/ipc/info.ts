import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { app, shell } from 'electron';
import si from 'systeminformation';
import { IPC } from '@shared/ipc';
import type { FolderSize, ScanFolder } from '@shared/types';
import { latencyChecks, networkDetails } from '../services/network-info';
import { folderSize, recentDownloads } from '../services/storage-info';
import { handle, on } from './handle';

const NAMES: Record<ScanFolder, string> = {
  documents: 'Documents',
  downloads: 'Downloads',
  desktop: 'Desktop',
  pictures: 'Pictures',
  videos: 'Videos',
  music: 'Music',
  temp: 'Temp files',
};
const DAY = 86_400_000;

export function registerInfoIpc(): void {
  let gateway: string | null = null;
  handle(IPC.network.details, async () => {
    const d = await networkDetails(si);
    gateway = d.gateway;
    return d;
  });
  handle(IPC.network.latency, () => latencyChecks(si, gateway));

  handle(IPC.storage.downloads, () => recentDownloads(app.getPath('downloads')));

  let scanning: Promise<FolderSize[]> | null = null;
  handle(IPC.storage.scan, () => {
    // One scan at a time; a second click joins the running one.
    scanning ??= (async () => {
      const ids = Object.keys(NAMES) as ScanFolder[];
      const out: FolderSize[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        const path = app.getPath(id);
        // Some systems map several folders to the same place (e.g. home): count it once.
        if (!existsSync(path) || seen.has(path)) continue;
        seen.add(path);
        const r = await folderSize(path, {
          budgetMs: 8_000,
          olderThan: id === 'downloads' || id === 'temp' ? Date.now() - 90 * DAY : undefined,
        });
        out.push({ id, name: NAMES[id], ...r });
      }
      return out.sort((a, b) => b.bytes - a.bytes);
    })().finally(() => {
      scanning = null;
    });
    return scanning;
  });

  // Only a file *name* inside Downloads; anything with path parts is rejected.
  on(
    IPC.storage.reveal,
    (_w, name) => {
      if (typeof name !== 'string' || basename(name) !== name) return;
      const p = join(app.getPath('downloads'), name);
      if (existsSync(p)) shell.showItemInFolder(p);
    },
    () => null,
  );
  on(
    IPC.storage.openSpecial,
    (_w, target) => {
      if (target === 'temp') void shell.openPath(app.getPath('temp'));
      else if (target === 'recycleBin' && process.platform === 'win32') {
        spawn('explorer.exe', ['shell:RecycleBinFolder'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      }
    },
    () => null,
  );
}
