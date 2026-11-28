/** Runs the start-up health checks (shared/health.ts) against the real app. Reads only: nothing
 *  is changed, and no secret is ever shown or sent anywhere (only "unlocks: yes/no"). */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { HealthCheck } from '@shared/update-health';
import { missingChannels, parsesAsJson } from '@shared/update-health';
import { IPC } from '@shared/ipc';
import type { Settings } from '@shared/types';
import { BACKUP_ITEMS } from './data-backup';

/** Channels the window can't work without. */
export const KEY_CHANNELS: string[] = [
  IPC.settings.get,
  IPC.settings.set,
  IPC.assistant.send,
  IPC.assistant.cancel,
  IPC.chats.state,
  IPC.chats.open,
  IPC.notes.state,
  IPC.notes.apply,
];

/** Encrypted keys whose files, when present, must still unlock. */
export const SECRET_FILES: Array<{ label: string; file: string }> = [
  { label: 'Claude key', file: 'anthropic-key.bin' },
  { label: 'email password', file: 'email.bin' },
  { label: 'calendar link', file: 'calendar-url.bin' },
  { label: 'Nexus key', file: 'nexus-key.bin' },
];

export async function runHealthChecks(d: {
  userData: string;
  settings(): Settings;
  handled(): Set<string>;
  window(): {
    alive: boolean;
    crashed: boolean;
    url: string;
  } | null;
  /** Windows encryption (for saved keys) is working. */
  encryption(): Promise<boolean>;
  /** Unlocks an encrypted file (true/false only). */
  unlocks(file: string): Promise<boolean>;
  phoneLink?(): { wanted: boolean; running: boolean; error: string | null };
  /** Errors logged since this start. */
  recentErrors(): number;
}): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const add = (c: HealthCheck): void => {
    checks.push(c);
  };

  // 1 · Saved data reads back.
  const broken: string[] = [];
  for (const item of BACKUP_ITEMS) {
    const p = join(d.userData, item);
    try {
      if (!existsSync(p)) continue;
      if (statSync(p).isDirectory()) {
        for (const f of readdirSync(p)
          .filter((x) => x.endsWith('.json'))
          .slice(0, 200))
          if (!parsesAsJson(readFileSync(join(p, f), 'utf8'))) broken.push(`${item}/${f}`);
      } else if (item.endsWith('.json') && !parsesAsJson(readFileSync(p, 'utf8')))
        broken.push(item);
    } catch {
      broken.push(item);
    }
  }
  add({
    id: 'data',
    label: 'Saved data',
    ok: !broken.length,
    critical: true,
    ...(broken.length ? { detail: `can't read ${broken.slice(0, 3).join(', ')}` } : {}),
  });

  // 2 · Settings loaded.
  let s: Settings | null;
  try {
    s = d.settings();
  } catch {
    s = null;
  }
  add({
    id: 'settings',
    label: 'Settings',
    ok: !!s && typeof s.assistantName === 'string' && typeof s.monthlyBudget === 'number',
    critical: true,
  });

  // 3 · The window's links to the rest of Alton.
  const missing = missingChannels(KEY_CHANNELS, d.handled());
  add({
    id: 'ipc',
    label: 'Chat, notes and settings links',
    ok: !missing.length,
    critical: true,
    ...(missing.length ? { detail: `missing ${missing.join(', ')}` } : {}),
  });

  // 4 · The window is up.
  const w = d.window();
  add({
    id: 'window',
    label: 'Main window',
    ok: !!w && w.alive && !w.crashed && !!w.url,
    critical: true,
    ...(!w ? { detail: 'not open' } : w.crashed ? { detail: 'crashed' } : {}),
  });

  // 5 · Encryption works (an update that breaks it locks every saved key), and each saved key
  // still unlocks (one that doesn't may just have been copied from another PC: a warning).
  const encryption = await d.encryption().catch(() => false);
  add({ id: 'encryption', label: 'Encryption for saved keys', ok: encryption, critical: true });
  const locked: string[] = [];
  if (encryption)
    for (const sf of SECRET_FILES) {
      const p = join(d.userData, sf.file);
      if (!existsSync(p)) continue;
      if (!(await d.unlocks(p).catch(() => false))) locked.push(sf.label);
    }
  add({
    id: 'secrets',
    label: 'Saved keys',
    ok: !locked.length,
    critical: false,
    ...(locked.length ? { detail: `can't unlock the ${locked.join(', ')}` } : {}),
  });

  // 6 · Phone link (only when it's switched on).
  const pl = d.phoneLink?.();
  if (pl?.wanted)
    add({
      id: 'phone',
      label: 'Phone link',
      ok: pl.running,
      critical: false,
      ...(pl.running ? {} : { detail: pl.error ?? 'not running' }),
    });

  // 7 · No errors since starting.
  const errs = d.recentErrors();
  add({
    id: 'errors',
    label: 'No errors since starting',
    ok: errs === 0,
    critical: false,
    ...(errs ? { detail: `${errs} logged` } : {}),
  });
  return checks;
}
