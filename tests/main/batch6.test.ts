import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  existsSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  bugRule,
  errorDialogRule,
  goalRule,
  workflowRule,
  type InitiativeInput,
} from '@shared/initiative';
import { clipAction, clipKind } from '@shared/clipboard';
import { findWorkflow, Habits } from '../../src/main/services/habits';
import {
  applyTidy,
  checkModsFolder,
  compareBench,
  docxText,
  modBase,
  optimisationTips,
  planTidy,
  searchDocuments,
  undoTidy,
} from '../../src/main/services/toolbox';
import { ForegroundWatch, isErrorWindow } from '../../src/main/services/foreground-watch';
import { backupGameSaves } from '../../src/main/services/save-backups';
import { Plugins } from '../../src/main/services/plugins';
import { NotesStore } from '../../src/main/services/notes-store';

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), `arc-${p}-`));
const old = (p: string): void => {
  const t = new Date(Date.now() - 3600_000);
  utimesSync(p, t, t);
};

describe('habits and workflows', () => {
  it('spots apps opened together at the same time on several days', () => {
    const opens = ['2026-11-16', '2026-11-17', '2026-11-18'].flatMap((day, i) => [
      { app: 'OUTLOOK', day, minute: 540 + i * 5 },
      { app: 'Teams', day, minute: 545 + i * 3 },
      { app: 'Spotify', day, minute: 1200 },
    ]);
    const w = findWorkflow(opens, new Date(2026, 10, 19));
    expect(w?.apps.sort()).toEqual(['OUTLOOK', 'Teams']);
    expect(findWorkflow(opens, new Date(2026, 10, 19), [['outlook.exe', 'teams']])).toBeNull();
  });

  it('records first opens and fires app reminders once', () => {
    const h = new Habits(undefined, () => new Date(2026, 10, 19, 9, 0));
    h.addReminder('Steam', 'update the graphics driver');
    expect(h.seen('explorer')).toEqual([]);
    expect(h.seen('steamwebhelper').map((r) => r.text)).toEqual(['update the graphics driver']);
    expect(h.seen('steam')).toEqual([]);
    expect(h.listReminders()).toEqual([]);
  });
});

describe('new suggestion rules', () => {
  const base: InitiativeInput = {
    now: new Date(2026, 10, 19, 14, 0),
    stats: null,
    events: null,
    weather: null,
    email: [],
    routines: [],
    userName: '',
  };
  it('offers help with error pop-ups, its own bugs, habits and stalled goals', () => {
    expect(
      errorDialogRule({
        ...base,
        foreground: { app: 'game', title: 'Game has stopped working', fullscreen: false },
        errorWindow: true,
      })?.ask?.text,
    ).toMatch(/error/);
    expect(bugRule({ ...base, recentErrors: 2 })).toBeNull();
    expect(bugRule({ ...base, recentErrors: 4 })?.text).toMatch(/4 errors/);
    expect(
      workflowRule({ ...base, workflow: { apps: ['Outlook', 'Teams'], minute: 545 } })?.text,
    ).toMatch(/Outlook, Teams around 9:05/);
    expect(goalRule({ ...base, staleGoal: { title: 'Learn Spanish', days: 9 } })?.text).toMatch(
      /9 days/,
    );
    expect(isErrorWindow({ app: 'WerFault', title: '', fullscreen: false, since: 0 })).toBe(true);
  });
});

describe('folder tidy', () => {
  it('plans by type, skips new/partial files and shortcuts, moves without overwriting, and undoes', () => {
    const d = tmp('tidy');
    for (const f of [
      'a.jpg',
      'b.pdf',
      'c.zip',
      'setup.exe',
      'odd.xyz',
      'link.lnk',
      'x.crdownload',
    ]) {
      writeFileSync(join(d, f), f);
      old(join(d, f));
    }
    writeFileSync(join(d, 'fresh.png'), 'new'); // modified just now
    mkdirSync(join(d, 'Pictures'));
    writeFileSync(join(d, 'Pictures', 'a.jpg'), 'existing');
    const plan = planTidy(d);
    expect(plan.map((m) => m.to.split(/[\\/]/).slice(-2).join('/')).sort()).toEqual([
      'Archives/c.zip',
      'Documents/b.pdf',
      'Installers/setup.exe',
      'Other/odd.xyz',
      'Pictures/a.jpg',
    ]);
    const done = applyTidy(plan);
    expect(readdirSync(join(d, 'Pictures')).sort()).toEqual(['a (2).jpg', 'a.jpg']);
    expect(existsSync(join(d, 'link.lnk'))).toBe(true);
    expect(undoTidy(done)).toBe(5);
    expect(existsSync(join(d, 'a.jpg'))).toBe(true);
    expect(existsSync(join(d, 'Archives'))).toBe(false); // emptied folders removed
  });
});

/** A one-file .docx (stored, not compressed). */
function makeDocx(path: string, xml: string): void {
  const name = Buffer.from('word/document.xml');
  const data = Buffer.from(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdStart = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(cdStart, 16);
  writeFileSync(path, Buffer.concat([local, name, data, central, name, end]));
}

describe('document search', () => {
  it('finds words inside text and Word files', () => {
    const d = tmp('docs');
    writeFileSync(join(d, 'shopping.txt'), 'milk, eggs and bread');
    makeDocx(
      join(d, 'Router notes.docx'),
      '<w:p><w:t>The wifi password is on the router sticker</w:t></w:p>',
    );
    mkdirSync(join(d, 'node_modules'));
    writeFileSync(join(d, 'node_modules', 'x.txt'), 'wifi router');
    expect(docxText(join(d, 'Router notes.docx'))).toMatch(/wifi password/);
    const hits = searchDocuments([d], 'wifi router');
    expect(hits.map((h) => h.path.split(/[\\/]/).pop())).toEqual(['Router notes.docx']);
    expect(hits[0]?.snippet).toMatch(/wifi password/);
  });
});

describe('minecraft mods', () => {
  it('finds duplicate mods, the latest crash and log errors', () => {
    expect(modBase('sodium-fabric-0.5.8+mc1.20.4.jar')).toBe('sodium');
    const d = tmp('mc');
    mkdirSync(join(d, 'mods'));
    for (const j of [
      'sodium-fabric-0.5.8+mc1.20.4.jar',
      'sodium-fabric-0.5.3+mc1.20.1.jar',
      'lithium-fabric-mc1.20.4-0.12.1.jar',
    ])
      writeFileSync(join(d, 'mods', j), '');
    mkdirSync(join(d, 'crash-reports'));
    writeFileSync(
      join(d, 'crash-reports', 'crash-2026.txt'),
      '---- Minecraft Crash Report ----\nDescription: Mixin apply failed',
    );
    mkdirSync(join(d, 'logs'));
    writeFileSync(join(d, 'logs', 'latest.log'), 'INFO ok\n[ERROR] Mixin apply failed sodium\n');
    const r = checkModsFolder(d, 'Test pack');
    expect(r?.duplicates).toEqual([{ mod: 'sodium', files: expect.any(Array) }]);
    expect(r?.loaders).toEqual(['fabric']);
    expect(r?.latestCrash).toMatch(/Mixin apply failed/);
    expect(r?.logErrors).toHaveLength(1);
  });
});

describe('optimisation and benchmark', () => {
  it('gives tips only for real problems', () => {
    const tips = optimisationTips({
      startupApps: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      powerPlan: 'Power saver',
      uptimeHours: 24 * 9,
      disks: [{ mount: 'C:', freePct: 8 }],
      memUsedPct: 91,
      topMemory: [{ name: 'chrome', gb: 4.2 }],
    });
    expect(tips).toHaveLength(5);
    expect(
      optimisationTips({
        startupApps: [],
        powerPlan: 'Balanced',
        uptimeHours: 5,
        disks: [],
        memUsedPct: 40,
        topMemory: [],
      })[0],
    ).toMatch(/Nothing obvious/);
  });
  it('compares benchmark runs', () => {
    const a = { at: 0, cpuSingleMBs: 100, diskWriteMBs: 500, diskReadMBs: 1000, memoryGBs: 10 };
    expect(compareBench({ ...a, cpuSingleMBs: 110 }, a)?.cpu).toBe('+10%');
    expect(compareBench(a, undefined)).toBeNull();
  });
});

describe('foreground watch', () => {
  it('reads app changes from the helper', () => {
    const w = new ForegroundWatch(undefined, () => 5);
    const seen = vi.fn();
    w.onChange(seen);
    w.feed('{"app":"EXCEL","title":"Budget.xlsx - Excel","fullscreen":false}\n');
    expect(w.get()).toEqual({
      app: 'EXCEL',
      title: 'Budget.xlsx - Excel',
      fullscreen: false,
      since: 5,
    });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('game save backups', () => {
  it('copies only saves changed during the session and keeps 5', () => {
    const root = tmp('saves');
    const saves = join(root, 'Saved Games', 'Game');
    mkdirSync(saves, { recursive: true });
    writeFileSync(join(saves, 'slot1.sav'), 'new');
    writeFileSync(join(saves, 'old.sav'), 'old');
    old(join(saves, 'old.sav'));
    writeFileSync(join(saves, 'debug.log'), 'log');
    const dest = join(root, 'backups');
    const since = Date.now() - 60_000;
    for (let i = 0; i < 7; i++)
      backupGameSaves({
        game: 'My Game',
        since,
        roots: [join(root, 'Saved Games')],
        dest,
        now: new Date(2026, 0, 1, 10, i),
      });
    const runs = readdirSync(join(dest, 'My Game'));
    expect(runs).toHaveLength(5);
    const latest = join(dest, 'My Game', runs.sort().at(-1) ?? '', 'Saved Games', 'Game');
    expect(readdirSync(latest)).toEqual(['slot1.sav']);
  });
});

describe('plugins', () => {
  it('loads knowledge and routines, reports bad files', () => {
    const d = tmp('plugins');
    writeFileSync(
      join(d, 'pizza.json'),
      JSON.stringify({
        name: 'Pizza',
        instructions: 'Large pepperoni.',
        routines: [{ name: 'Pizza night' }],
      }),
    );
    writeFileSync(join(d, 'broken.json'), '{ nope');
    const p = new Plugins(d);
    const list = p.list();
    expect(list.find((x) => x.name === 'Pizza')?.routines).toHaveLength(1);
    expect(list.find((x) => x.file === 'broken.json')?.error).toMatch(/JSON/);
    expect(p.instructions()).toMatch(/\[Pizza\] Large pepperoni/);
  });
});

describe('clipboard intelligence', () => {
  it('recognises what was copied', () => {
    expect(clipKind('https://example.com/a')).toBe('link');
    expect(clipKind('me@example.com')).toBe('email');
    expect(clipKind('1Z999AA10123456784')).toBe('tracking');
    expect(clipKind('10 Downing Street, London SW1A 2AA')).toBe('address');
    expect(clipAction('x'.repeat(500))?.label).toBe('Summarise');
    expect(clipAction('hello')).toBeNull();
  });
});

describe('goals and memory editing', () => {
  it('tracks goal progress and spots stalled goals', () => {
    let now = Date.UTC(2026, 10, 1);
    const n = new NotesStore({ now: () => now });
    expect(n.tool('manage_goal', { action: 'add', goal: 'Learn Spanish' })).toEqual({
      added: 'Learn Spanish',
    });
    expect(
      n.tool('manage_goal', {
        action: 'update',
        goal: 'spanish',
        progress: 40,
        note: 'Finished unit 3',
      }),
    ).toEqual({
      goal: 'Learn Spanish',
      progress: '40%',
    });
    now += 10 * 86_400_000;
    expect(n.staleGoal()).toEqual({ title: 'Learn Spanish', days: 10 });
    const m = n.remember('Router is a BT Hub', true, 'solutions', 'Home network');
    n.apply({ op: 'editMemory', id: m?.id ?? '', text: 'Router is a BT Smart Hub 2' });
    const saved = n.state().memories[0];
    expect(saved).toMatchObject({
      text: 'Router is a BT Smart Hub 2',
      category: 'solutions',
      project: 'Home network',
    });
    expect(saved?.learned).toBeUndefined();
    expect(n.memoryTexts()[0]).toMatch(/^\[Home network\]/);
  });
});
