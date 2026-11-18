/** App registry: userData/apps.json, seeded with defaults on first run.
 *  Users can edit the file to add apps, change paths, or add trigger phrases. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { AppEntry } from '@shared/types';

export type { AppEntry };

export const DEFAULT_APPS: AppEntry[] = [
  {
    id: 'chrome',
    name: 'Chrome',
    startMenu: 'Google Chrome',
    icon: 'Globe',
    intents: ['browser', 'browse the web', 'open browser', 'google chrome'],
  },
  {
    id: 'vscode',
    name: 'VS Code',
    startMenu: 'Visual Studio Code',
    uri: 'vscode:',
    icon: 'Code2',
    intents: ['vs code', 'visual studio code', 'code', 'my editor', 'start coding'],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    path: 'wt.exe',
    startMenu: 'Terminal',
    icon: 'SquareTerminal',
    intents: ['terminal', 'command line', 'windows terminal'],
  },
  {
    id: 'explorer',
    name: 'File Explorer',
    path: 'explorer.exe',
    icon: 'Folder',
    intents: ['files', 'file explorer', 'explorer'],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    startMenu: 'Spotify',
    uri: 'spotify:',
    icon: 'Music',
    intents: ['music', 'play music'],
  },
  {
    id: 'discord',
    name: 'Discord',
    startMenu: 'Discord',
    icon: 'MessageSquare',
    intents: ['chat with friends'],
  },
  {
    id: 'steam',
    name: 'Steam',
    startMenu: 'Steam',
    uri: 'steam://open/main',
    icon: 'Gamepad2',
    intents: ['games', 'play games'],
  },
  {
    id: 'obs',
    name: 'OBS Studio',
    startMenu: 'OBS Studio',
    icon: 'Video',
    intents: ['obs', 'start recording'],
  },
  {
    id: 'notes',
    name: 'Obsidian',
    startMenu: 'Obsidian',
    icon: 'NotebookPen',
    intents: ['notes', 'take a note'],
  },
  {
    id: 'calc',
    name: 'Calculator',
    path: 'calc.exe',
    startMenu: 'Calculator',
    icon: 'Calculator',
    intents: ['calc', 'calculator', 'do some maths'],
  },
  {
    id: 'settings',
    name: 'Settings',
    uri: 'ms-settings:',
    icon: 'Settings',
    intents: ['windows settings', 'settings'],
  },
  {
    id: 'taskmgr',
    name: 'Task Manager',
    path: 'taskmgr.exe',
    icon: 'Activity',
    intents: ['task manager', 'what is running'],
  },
];

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function valid(e: unknown): e is AppEntry {
  if (!e || typeof e !== 'object') return false;
  const a = e as Record<string, unknown>;
  return (
    typeof a['id'] === 'string' && typeof a['name'] === 'string' && Array.isArray(a['intents'])
  );
}

export class AppRegistry {
  private apps: AppEntry[] = DEFAULT_APPS;
  constructor(private readonly file: string) {}

  /** Reads apps.json, creating it with defaults on first run. A broken file falls back to defaults. */
  load(): AppEntry[] {
    try {
      if (!existsSync(this.file)) {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file, JSON.stringify(DEFAULT_APPS, null, 2));
      }
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      this.apps = Array.isArray(parsed) ? parsed.filter(valid) : DEFAULT_APPS;
    } catch {
      this.apps = DEFAULT_APPS;
    }
    return this.apps;
  }

  list(): AppEntry[] {
    return this.apps;
  }

  /** Add or replace an entry (matched by id) and write apps.json. */
  upsert(entry: AppEntry): AppEntry[] {
    const clean: AppEntry = {
      ...entry,
      id:
        entry.id
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '') || 'app',
      name: entry.name.trim().slice(0, 60),
      intents: [...new Set(entry.intents.map((i) => i.trim().toLowerCase()).filter(Boolean))].slice(
        0,
        20,
      ),
    };
    const i = this.apps.findIndex((a) => a.id === clean.id);
    this.apps = i >= 0 ? this.apps.map((a, k) => (k === i ? clean : a)) : [...this.apps, clean];
    this.write();
    return this.apps;
  }

  remove(id: string): AppEntry[] {
    this.apps = this.apps.filter((a) => a.id !== id);
    this.write();
    return this.apps;
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.apps, null, 2));
    } catch {
      /* non-fatal */
    }
  }

  /** Match by id, name, Start-menu name or intent phrase. */
  find(target: string): AppEntry | undefined {
    const q = norm(target);
    if (!q) return undefined;
    return (
      this.apps.find(
        (a) => norm(a.id) === q || norm(a.name) === q || (a.startMenu && norm(a.startMenu) === q),
      ) ?? this.apps.find((a) => a.intents.some((i) => norm(i) === q))
    );
  }
}
