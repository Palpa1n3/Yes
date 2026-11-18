import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presetById } from '@shared/personalities';
import { DEFAULT_SETTINGS, type StoredMessage } from '@shared/types';
import { HistoryStore, MAX_HISTORY } from '../../src/main/services/history-store';
import { SettingsStore } from '../../src/main/services/settings-store';
import { DEFAULT_PERSONALITY } from '@shared/personalities';
import { plan } from '../../src/main/services/ai-provider';
import { snapshot } from '../../src/main/services/system-stats';

const dir = () => mkdtempSync(join(tmpdir(), 'arc-'));

describe('SettingsStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('seeds first run, persists changes and reloads them', () => {
    const file = join(dir(), 'settings.json');
    const a = new SettingsStore(file);
    expect(a.load({ userName: 'Jack' }).userName).toBe('Jack');
    expect(existsSync(file)).toBe(true);
    a.set({ theme: 'crimson', personality: presetById('terminal')! });
    vi.advanceTimersByTime(400);
    const b = new SettingsStore(file);
    expect(b.load()).toMatchObject({
      theme: 'crimson',
      userName: 'Jack',
      personality: { id: 'terminal' },
    });
  });

  it('recovers from a corrupt file and notifies listeners', () => {
    const file = join(dir(), 'settings.json');
    writeFileSync(file, '{ nope');
    const s = new SettingsStore(file);
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    const l = vi.fn();
    s.subscribe(l);
    s.set({ sfx: false });
    expect(l).toHaveBeenCalledWith(
      expect.objectContaining({ sfx: false }),
      expect.objectContaining({ sfx: true }),
    );
  });

  it('reset keeps your name', () => {
    const s = new SettingsStore();
    s.load();
    s.set({ userName: 'Jack', theme: 'mono' });
    expect(s.reset()).toMatchObject({ userName: 'Jack', theme: DEFAULT_SETTINGS.theme });
  });
});

describe('HistoryStore', () => {
  it('saves settled messages, caps length, and filters junk', () => {
    const file = join(dir(), 'history.json');
    const h = new HistoryStore(file);
    const many: StoredMessage[] = Array.from({ length: MAX_HISTORY + 20 }, (_, i) => ({
      id: `u${i}`,
      role: 'user',
      text: `m${i}`,
      timestamp: i,
    }));
    many.push({
      id: 'a',
      role: 'assistant',
      text: 'hi',
      timestamp: 1,
      streaming: true,
      revealed: false,
    });
    many.push({
      id: 'c',
      role: 'command',
      timestamp: 2,
      command: { cmd: { id: 'x', action: 'launch_app', risk: 'safe' }, status: 'awaiting' },
    });
    h.save(many);
    const back = h.load();
    expect(back).toHaveLength(MAX_HISTORY);
    expect(back.find((m) => m.id === 'a')).toMatchObject({ streaming: false, revealed: true });
    expect(back.find((m) => m.id === 'c')).toMatchObject({ command: { status: 'cancelled' } });
    writeFileSync(
      file,
      JSON.stringify([{ role: 'evil' }, { id: 'ok', role: 'user', text: 't', timestamp: 1 }]),
    );
    expect(h.load().map((m) => m.id)).toEqual(['ok']);
    h.clear();
    expect(existsSync(file)).toBe(false);
    expect(readFileSync).toBeDefined();
  });
});

describe('mock replies follow the personality', () => {
  const run = (text: string, id: string, userName = 'Jack') =>
    plan(text, 0, snapshot, { personality: presetById(id) ?? DEFAULT_PERSONALITY, userName });

  it('Terminal is terse and humourless', () => {
    expect(run('open spotify', 'terminal').text).toBe('Launching Spotify.');
    expect(run('tell me a joke', 'terminal').text).toBe('Humour disabled.');
    expect(run('hello', 'terminal').text).toBe('Online.');
  });

  it('Mentor explains, Co-pilot uses your name, Butler says sir', () => {
    expect(run('open spotify', 'mentor').text).toMatch(/app list.*Start menu/);
    expect(run('hello', 'copilot').text).toMatch(/Jack/);
    expect(run('hello', 'butler').text).toMatch(/sir/);
  });
});
