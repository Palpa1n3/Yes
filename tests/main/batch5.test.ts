import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCrashEvents } from '../../src/main/services/crash-reports';
import { DataBackup } from '../../src/main/services/data-backup';
import { OllamaProvider, localModels } from '../../src/main/services/ollama-provider';
import { OfflineError } from '../../src/main/services/anthropic-provider';

describe('crash reports', () => {
  it('reads app crashes and shutdowns from event log JSON', () => {
    const ev = parseCrashEvents(
      JSON.stringify([
        {
          Time: '2026-11-18 21:04',
          Id: 1000,
          Message:
            'Faulting application name: FortniteClient-Win64-Shipping.exe, version: 1.0 Faulting module name: nvwgf2umx.dll, version: 31 Exception code: 0xc0000005',
        },
        {
          Time: '2026-11-17 10:00',
          Id: 41,
          Message: 'The system has rebooted without cleanly shutting down first.',
        },
      ]),
    );
    expect(ev[0]).toMatchObject({ kind: 'app crash', app: 'FortniteClient-Win64-Shipping.exe' });
    expect(ev[0]?.detail).toMatch(/nvwgf2umx\.dll.*access violation/);
    expect(ev[1]?.kind).toBe('unexpected shutdown');
    expect(
      parseCrashEvents(
        '{"Time":"x","Id":1002,"Message":"The program game.exe stopped interacting"}',
      )[0],
    ).toMatchObject({ kind: 'app hang', app: 'game.exe' });
    expect(parseCrashEvents('')).toEqual([]);
  });
});

describe('data backups', () => {
  it('backs up daily, keeps 7, and restores', () => {
    const ud = mkdtempSync(join(tmpdir(), 'arc-bk-'));
    writeFileSync(join(ud, 'settings.json'), '{"a":1}');
    writeFileSync(join(ud, 'anthropic-key.bin'), 'secret');
    mkdirSync(join(ud, 'chats'));
    writeFileSync(join(ud, 'chats', 'c1.json'), '[]');
    let day = 1;
    const b = new DataBackup(ud, () => new Date(2026, 10, day, 12));
    expect(b.daily()?.name).toBe('2026-11-01');
    expect(b.daily()).toBeNull(); // already done today
    expect(existsSync(join(ud, 'backups', '2026-11-01', 'chats', 'c1.json'))).toBe(true);
    expect(existsSync(join(ud, 'backups', '2026-11-01', 'anthropic-key.bin'))).toBe(false);
    for (day = 2; day <= 10; day++) b.daily();
    expect(b.list().filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.name))).toHaveLength(7);
    writeFileSync(join(ud, 'settings.json'), '{"a":2}');
    expect(b.restore('2026-11-09')).toBe(true);
    expect(readFileSync(join(ud, 'settings.json'), 'utf8')).toBe('{"a":1}');
    expect(b.list().some((x) => x.name.endsWith('before-restore'))).toBe(true);
    expect(b.restore('../../etc')).toBe(false);
  });
});

const stream = (lines: string[]): Response =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(`${l}\n`));
        c.close();
      },
    }),
  );

describe('local AI (Ollama)', () => {
  it('streams a reply', async () => {
    const box: { body?: { model: string; messages: Array<{ role: string }> } } = {};
    const p = new OllamaProvider({
      model: () => 'llama3.2',
      context: () => 'It is noon.',
      fetch: (async (_u: string, init: RequestInit) => {
        box.body = JSON.parse(String(init.body)) as typeof box.body;
        return stream([
          JSON.stringify({ message: { content: 'Hel' } }),
          JSON.stringify({ message: { content: 'lo' } }),
          JSON.stringify({ done: true }),
        ]);
      }) as typeof fetch,
    });
    const out: string[] = [];
    for await (const c of p.send([{ role: 'user', content: 'hi' }], { systemPrompt: 'Be Alton.' }))
      if (c.type === 'text') out.push(c.delta);
    expect(out.join('')).toBe('Hello');
    expect(box.body?.model).toBe('llama3.2');
    expect(box.body?.messages[0]?.role).toBe('system');
  });

  it('reports Ollama not running as offline', async () => {
    const p = new OllamaProvider({
      model: () => 'x',
      context: () => '',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(async () => {
      for await (const _ of p.send([], { systemPrompt: '' })) void _;
    }).rejects.toBeInstanceOf(OfflineError);
    expect(
      await localModels((async () => {
        throw new Error('no');
      }) as typeof fetch),
    ).toBeNull();
    expect(
      await localModels((async () =>
        Response.json({ models: [{ name: 'llama3.2:latest' }] })) as typeof fetch),
    ).toEqual(['llama3.2:latest']);
  });
});

import {
  epicGames,
  findGame,
  launchLink,
  steamGames,
  vdfValues,
} from '../../src/main/services/installed-games';
import { sessionLine, summarise } from '../../src/main/services/gaming-sessions';

describe('installed games', () => {
  it('finds Steam and Epic games and matches spoken names', () => {
    const root = mkdtempSync(join(tmpdir(), 'arc-games-'));
    const steam = join(root, 'Steam');
    const lib2 = join(root, 'Lib2');
    mkdirSync(join(steam, 'steamapps'), { recursive: true });
    mkdirSync(join(lib2, 'steamapps'), { recursive: true });
    writeFileSync(
      join(steam, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders"\n{\n "1"\n {\n  "path"\t\t"${lib2.replace(/\\/g, '\\\\')}"\n }\n}`,
    );
    writeFileSync(
      join(steam, 'steamapps', 'appmanifest_1091500.acf'),
      '"AppState"\n{\n "appid" "1091500"\n "name" "Cyberpunk 2077"\n "installdir" "Cyberpunk 2077"\n "SizeOnDisk" "70000000000"\n}',
    );
    writeFileSync(
      join(lib2, 'steamapps', 'appmanifest_228980.acf'),
      '"AppState"\n{\n "appid" "228980"\n "name" "Steamworks Common Redistributables"\n}',
    );
    writeFileSync(
      join(lib2, 'steamapps', 'appmanifest_730.acf'),
      '"AppState"\n{\n "appid" "730"\n "name" "Counter-Strike 2"\n "installdir" "Counter-Strike Global Offensive"\n}',
    );
    const epicDir = join(root, 'Manifests');
    mkdirSync(epicDir);
    writeFileSync(
      join(epicDir, 'a.item'),
      JSON.stringify({
        DisplayName: 'Fortnite',
        AppName: 'Fortnite',
        InstallLocation: 'C:\\Fortnite',
        AppCategories: ['games'],
      }),
    );
    writeFileSync(
      join(epicDir, 'b.item'),
      JSON.stringify({ DisplayName: 'Unreal Engine', AppName: 'UE', AppCategories: ['engines'] }),
    );
    const games = [...steamGames(steam), ...epicGames(epicDir)];
    expect(games.map((g) => g.name).sort()).toEqual([
      'Counter-Strike 2',
      'Cyberpunk 2077',
      'Fortnite',
    ]);
    expect(games.find((g) => g.id === '1091500')?.sizeGB).toBe(65.2);
    expect(findGame(games, 'cyberpunk')?.id).toBe('1091500');
    expect(findGame(games, 'counter strike')?.id).toBe('730');
    expect(launchLink(findGame(games, 'fortnite')!)).toMatch(
      /^com\.epicgames\.launcher:\/\/apps\/Fortnite/,
    );
    expect(vdfValues('"path" "D:\\\\Games"', 'path')).toEqual(['D:\\Games']);
  });
});

describe('gaming sessions', () => {
  it('summarises performance and flags heat and CPU bottlenecks', () => {
    const s = summarise('Cyberpunk 2077', 0, 45 * 60_000, [
      { cpu: 90, cpuTemp: 80, gpu: 50, gpuTemp: 86, memPct: 70 },
      { cpu: 94, cpuTemp: 84, gpu: 54, gpuTemp: 88, memPct: 72 },
    ]);
    expect(s.cpu).toEqual({ avg: 92, max: 94 });
    const line = sessionLine(s);
    expect(line).toMatch(/45 min/);
    expect(line).toMatch(/hot/);
    expect(line).toMatch(/bottleneck/);
  });
});
