import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  OffsiteBackup,
  insideFolder,
  newRecoveryCode,
  open,
  seal,
  type KeyStore,
} from '../../src/main/services/offsite-backup';

const memKeys = (): KeyStore & { value: string | null } => {
  const k = {
    value: null as string | null,
    get: async () => k.value,
    set: async (v: string) => {
      k.value = v;
    },
  };
  return k;
};

function pc() {
  const userData = mkdtempSync(join(tmpdir(), 'arc-ud-'));
  writeFileSync(join(userData, 'settings.json'), '{"assistantName":"Alton"}');
  writeFileSync(join(userData, 'notes.json'), '{"memories":[{"text":"Mum is called Sue"}]}');
  mkdirSync(join(userData, 'chats'));
  writeFileSync(join(userData, 'chats', 'c1.json'), '{"id":"c1","title":"GTA chat"}');
  writeFileSync(join(userData, 'anthropic-key.bin'), 'SECRET-KEY');
  return userData;
}

describe('encrypted backups to another folder', () => {
  it('saves an encrypted, checked copy (no keys inside) and gives a recovery code once', async () => {
    const userData = pc();
    const folder = mkdtempSync(join(tmpdir(), 'arc-usb-'));
    const keys = memKeys();
    let day = 1;
    const svc = new OffsiteBackup({
      userData,
      folder: () => folder,
      keys,
      now: () => new Date(2026, 10, day, 12),
    });
    const r = await svc.run();
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/saved and checked \(3 files\)/);
    expect(r.recoveryCode).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
    const files = readdirSync(join(folder, 'Alton backups'));
    expect(files.sort()).toEqual(['alton-2026-11-01.altonbak', 'alton-backup-key.json']);
    const blob = readFileSync(join(folder, 'Alton backups', 'alton-2026-11-01.altonbak'));
    expect(blob.toString('latin1')).not.toMatch(/Sue|Alton|GTA/);
    // Next time: no new code.
    day = 2;
    expect((await svc.run()).recoveryCode).toBeUndefined();
    // Only the last 8 are kept.
    for (day = 3; day <= 12; day++) await svc.run();
    expect(svc.list()).toHaveLength(8);
    expect(svc.list()[0]?.day).toBe('2026-11-12');
  });

  it('restores on this PC, and on a new PC only with the recovery code', async () => {
    const userData = pc();
    const folder = mkdtempSync(join(tmpdir(), 'arc-usb-'));
    const keys = memKeys();
    const svc = new OffsiteBackup({ userData, folder: () => folder, keys });
    const { recoveryCode } = await svc.run();
    const file = svc.list()[0]!.file;

    // This PC: lose a memory, restore it.
    writeFileSync(join(userData, 'notes.json'), '{"memories":[]}');
    const before = vi.fn();
    const here = new OffsiteBackup({ userData, folder: () => folder, keys, backupCurrent: before });
    expect((await here.restore(file)).ok).toBe(true);
    expect(before).toHaveBeenCalled();
    expect(readFileSync(join(userData, 'notes.json'), 'utf8')).toMatch(/Sue/);

    // A new PC: no key; wrong code fails; the right code works and the key carries on.
    const fresh = mkdtempSync(join(tmpdir(), 'arc-ud2-'));
    const newKeys = memKeys();
    const other = new OffsiteBackup({ userData: fresh, folder: () => folder, keys: newKeys });
    expect((await other.restore(file)).message).toMatch(/recovery code/);
    expect((await other.restore(file, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF')).ok).toBe(false);
    const ok = await other.restore(file, (recoveryCode ?? '').toLowerCase());
    expect(ok.ok).toBe(true);
    expect(readFileSync(join(fresh, 'chats', 'c1.json'), 'utf8')).toMatch(/GTA chat/);
    expect(newKeys.value).toBe(keys.value);
  });

  it('refuses a changed file, a folder inside Alton’s data, and junk', async () => {
    const userData = pc();
    const folder = mkdtempSync(join(tmpdir(), 'arc-usb-'));
    const keys = memKeys();
    const svc = new OffsiteBackup({ userData, folder: () => folder, keys });
    await svc.run();
    const file = svc.list()[0]!.file;
    const p = join(folder, 'Alton backups', file);
    const b = readFileSync(p);
    b[b.length - 3] = (b[b.length - 3] ?? 0) ^ 0xff;
    writeFileSync(p, b);
    const r = await svc.restore(file);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/couldn't be unlocked/);
    expect(readFileSync(join(userData, 'notes.json'), 'utf8')).toMatch(/Sue/);

    const inside = new OffsiteBackup({
      userData,
      folder: () => join(userData, 'backups'),
      keys,
    });
    expect((await inside.run()).message).toMatch(/inside Alton's own data/);
    expect((await svc.restore('../../evil.altonbak')).ok).toBe(false);
    expect(insideFolder('C:\\a\\b', 'C:\\a')).toBe(true);
    expect(insideFolder('D:\\b', 'C:\\a')).toBe(false);
  });

  it('encrypts and unlocks; codes are random', () => {
    const key = Buffer.alloc(32, 7);
    const box = seal(key, Buffer.from('hello'));
    expect(open(key, box).toString()).toBe('hello');
    expect(() => open(Buffer.alloc(32, 8), box)).toThrow(/couldn't be unlocked/);
    expect(newRecoveryCode()).not.toBe(newRecoveryCode());
  });
});
