import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mergeLists } from '../../src/shared/phone';
import { allowFor, JourneyService, LeaveReminders } from '../../src/main/services/journey';
import {
  buildName,
  checkBuild,
  listWorlds,
  writeBuild,
} from '../../src/main/services/minecraft-build';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('phone ↔ PC list sync', () => {
  it('keeps phone additions, ticks and deletions that the PC has not seen yet', () => {
    const pc = [
      {
        name: 'Shopping',
        items: [
          { text: 'milk', done: false },
          { text: 'eggs', done: false },
        ],
      },
    ];
    const out = mergeLists(
      pc,
      [
        { list: 'Shopping', text: 'bread' },
        { list: 'Shopping', text: 'Milk' },
        { list: 'DIY', text: 'screws' },
      ],
      [
        { list: 'Shopping', text: 'milk', op: 'done' },
        { list: 'Shopping', text: 'eggs', op: 'remove' },
      ],
    );
    expect(out).toEqual([
      {
        name: 'Shopping',
        items: [
          { text: 'milk', done: true },
          { text: 'bread', done: false },
        ],
      },
      { name: 'DIY', items: [{ text: 'screws', done: false }] },
    ]);
    expect(pc[0]?.items).toHaveLength(2); // the PC's copy isn't changed
  });
});

describe('journey times', () => {
  const fake = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('nominatim')
        ? [{ lat: '53.8', lon: '-1.55', display_name: 'Customer Cafe, Leeds, England, UK' }]
        : { routes: [{ duration: 25 * 60, distance: 14_200 }] },
  }));

  it('finds places and routes, with a margin for driving', async () => {
    const j = new JourneyService(fake);
    const to = await j.find('Customer Cafe Leeds');
    expect(to?.name).toBe('Customer Cafe, Leeds, England');
    const r = await j.route({ lat: 53.7, lon: -1.5, name: 'home' }, to!);
    expect(r).toEqual({ minutes: 25, km: 14.2, mode: 'driving', allow: 35 });
    expect(allowFor(20, 'walking')).toBe(23);
    await j.find('customer cafe leeds'); // cached
    expect(fake.mock.calls.filter((c) => String(c[0]).includes('nominatim'))).toHaveLength(1);
  });

  it('gives one leave-by heads-up, 10 minutes before it is time to go', async () => {
    let now = new Date(2026, 10, 20, 12, 0).getTime();
    const start = new Date(2026, 10, 20, 13, 0).getTime();
    const notify = vi.fn();
    const r = new LeaveReminders({
      journeys: new JourneyService(fake),
      home: () => ({ lat: 53.7, lon: -1.5, name: 'home' }),
      events: () => [
        {
          id: 'e1',
          title: 'Customer Cafe',
          start,
          end: start + 3600e3,
          allDay: false,
          location: 'Customer Cafe, Leeds',
        },
      ],
      enabled: () => true,
      notify,
      now: () => now,
    });
    await r.tick();
    expect(notify).not.toHaveBeenCalled(); // leave at 12:25, heads-up from 12:15
    now = new Date(2026, 10, 20, 12, 16).getTime();
    await r.tick();
    await r.tick();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[0]).toMatch(/^Leave by 12:25 for Customer Cafe/);
  });
});

describe('Minecraft builds', () => {
  it('only accepts relative setblock/fill/clone commands', () => {
    expect(
      checkBuild([
        '/fill ~1 ~ ~1 ~5 ~4 ~5 minecraft:oak_planks hollow',
        '# roof',
        'setblock ~3 ~5 ~3 minecraft:glowstone',
      ]),
    ).toEqual({
      ok: true,
      lines: [
        'fill ~1 ~ ~1 ~5 ~4 ~5 minecraft:oak_planks hollow',
        'setblock ~3 ~5 ~3 minecraft:glowstone',
      ],
    });
    expect(checkBuild(['op Jack']).ok).toBe(false);
    expect(checkBuild(['execute run op Jack']).ok).toBe(false);
    expect(checkBuild(['setblock 10 64 10 minecraft:stone']).ok).toBe(false);
    expect(buildName('Big Castle!')).toBe('big_castle');
  });

  it('saves the build as a datapack function in the most recent world', () => {
    const saves = mkdtempSync(join(tmpdir(), 'arc-mc-'));
    dirs.push(saves);
    for (const w of ['Old', 'New']) {
      mkdirSync(join(saves, w), { recursive: true });
      writeFileSync(join(saves, w, 'level.dat'), 'x');
    }
    expect(listWorlds(saves)).toContain('New');
    const cmd = writeBuild(
      join(saves, 'New'),
      'hut',
      ['fill ~ ~ ~ ~3 ~3 ~3 minecraft:stone hollow'],
      'A hut',
    );
    expect(cmd).toBe('/function alton:hut');
    const f = readFileSync(
      join(saves, 'New', 'datapacks', 'alton', 'data', 'alton', 'function', 'hut.mcfunction'),
      'utf8',
    );
    expect(f).toContain('fill ~ ~ ~ ~3 ~3 ~3 minecraft:stone hollow');
    expect(readFileSync(join(saves, 'New', 'datapacks', 'alton', 'pack.mcmeta'), 'utf8')).toContain(
      'pack_format',
    );
  });
});
