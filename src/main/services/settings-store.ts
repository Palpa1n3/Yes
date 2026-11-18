/** Settings held in main (the source of truth), persisted to userData/settings.json,
 *  with change notifications so the tray, hotkey and renderer stay in sync. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sanitizeSettings } from '@shared/settings';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

type Listener = (next: Settings, prev: Settings) => void;

export class SettingsStore {
  private value: Settings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  /** `file` omitted = in-memory only (tests). */
  constructor(private readonly file?: string) {}

  /** Load from disk; `seed` fills first-run values (e.g. userName from the OS account). */
  load(seed: Partial<Settings> = {}): Settings {
    let raw: unknown = null;
    try {
      if (this.file && existsSync(this.file)) raw = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      raw = null; // corrupt file: start from defaults (it will be rewritten on next save)
    }
    this.value = sanitizeSettings(raw ?? { ...DEFAULT_SETTINGS, ...seed });
    if (!raw) this.saveNow();
    return this.value;
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): Settings {
    const prev = this.value;
    // assistantName lives in both places; keep them in step.
    const merged = { ...prev, ...patch };
    if (patch.personality && !patch.assistantName)
      merged.personality = { ...patch.personality, assistantName: merged.assistantName };
    this.value = sanitizeSettings(merged);
    for (const l of this.listeners) l(this.value, prev);
    this.scheduleSave();
    return this.value;
  }

  reset(): Settings {
    const keepName = { userName: this.value.userName };
    return this.set({ ...DEFAULT_SETTINGS, ...keepName });
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  /** Atomic write: temp file then rename, so a crash can't leave half a file. */
  saveNow(): void {
    clearTimeout(this.saveTimer);
    if (!this.file) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.value, null, 2));
      renameSync(tmp, this.file);
    } catch {
      /* disk full / permissions: keep running with in-memory settings */
    }
  }
}
