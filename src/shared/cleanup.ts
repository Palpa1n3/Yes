/** "Free up space": known-safe places to clear, sized first, cleared only when the user
 *  ticks them and confirms. Downloads files go to the Recycle Bin, not deleted. */

export type CleanupId = 'temp' | 'recycle' | 'crash' | 'browsers' | 'shaders' | 'launchers';

export interface CleanupItem {
  id: CleanupId;
  label: string;
  detail: string;
  bytes: number;
  files: number;
  /** Ticked by default (harmless to clear). */
  recommended: boolean;
}

export interface BigFile {
  name: string;
  size: number;
  modified: number;
}

export interface CleanupScan {
  items: CleanupItem[];
  downloads: BigFile[];
}

export interface CleanupResult {
  freed: number;
  /** Things that couldn't be cleared (usually in use). */
  skipped: number;
  message: string;
}

export const BIG_FILE = 200 * 1024 ** 2;
export const OLD_FILE_DAYS = 180;

export const CLEANUP_INFO: Record<
  CleanupId,
  { label: string; detail: string; recommended: boolean }
> = {
  temp: {
    label: 'Temporary files',
    detail: 'Left behind by installers and apps (older than a day).',
    recommended: true,
  },
  recycle: { label: 'Recycle Bin', detail: 'Files you already deleted.', recommended: false },
  crash: {
    label: 'Crash reports',
    detail: 'Dumps and error reports from apps that crashed.',
    recommended: true,
  },
  browsers: {
    label: 'Browser caches',
    detail:
      'Chrome, Edge, Brave, Opera, Firefox. Logins and history are kept; close browsers first for the most space.',
    recommended: true,
  },
  shaders: {
    label: 'Graphics shader caches',
    detail: 'NVIDIA / AMD / DirectX. Games rebuild them; the next launch may load a little slower.',
    recommended: false,
  },
  launchers: {
    label: 'Launcher & app caches',
    detail: 'Steam, Epic Games and Discord web caches.',
    recommended: true,
  },
};
