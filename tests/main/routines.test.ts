import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { canonIntent, toCommand, type CanonicalCommand } from '@shared/commands';
import { DEFAULT_PERSONALITY } from '@shared/personalities';
import {
  DEFAULT_ROUTINES,
  buildBriefing,
  describeStep,
  findRoutine,
  matchRoutine,
  sanitizeRoutines,
  stepIntent,
  stepProblem,
  type Routine,
} from '@shared/routines';
import type { RoutineProgress, SystemStats, TimerInfo } from '@shared/types';
import type { WeatherData } from '@shared/weather';
import { toIntent } from '../../src/main/services/anthropic-provider';
import { RoutineService } from '../../src/main/services/routine-service';

const tmp = (): string => join(mkdtempSync(join(tmpdir(), 'arc-rtn-')), 'routines.json');

const focus: Routine = {
  id: 'focus-mode',
  name: 'Focus mode',
  icon: 'Target',
  phrases: ['work mode', 'focus'],
  steps: [
    { kind: 'set_volume', target: '30' },
    { kind: 'launch_app', target: 'Spotify' },
    { kind: 'say', target: 'Go!' },
  ],
  runAtStartup: false,
};

describe('routine data', () => {
  it('sanitises stored routines, dropping bad steps and duplicates', () => {
    const out = sanitizeRoutines([
      {
        id: 'x',
        name: '  Gaming  ',
        icon: 'Nope',
        phrases: ['game time', 'game time', '', 7],
        steps: [
          { kind: 'launch_app', target: 'Steam' },
          { kind: 'format_disk' },
          { kind: 'lock_screen', target: 'junk' },
        ],
        runAtStartup: 'yes',
      },
      { id: 'x', name: 'dupe' },
      { name: '' },
      'garbage',
    ]);
    expect(out).toEqual([
      {
        id: 'x',
        name: 'Gaming',
        icon: 'Zap',
        phrases: ['game time'],
        steps: [{ kind: 'launch_app', target: 'Steam' }, { kind: 'lock_screen' }],
        runAtStartup: false,
      },
    ]);
    expect(sanitizeRoutines('nope')).toEqual([]);
    expect(sanitizeRoutines(DEFAULT_ROUTINES)).toEqual(DEFAULT_ROUTINES);
  });

  it('matches whole messages to a routine name or phrase', () => {
    const list = [focus, ...DEFAULT_ROUTINES.slice(0, 1)];
    expect(matchRoutine('work mode', list)?.id).toBe('focus-mode');
    expect(matchRoutine('Run focus mode please', list)?.id).toBe('focus-mode');
    expect(matchRoutine('start the focus routine', list)?.id).toBe('focus-mode');
    expect(matchRoutine('Good morning!', list)?.id).toBe('morning-briefing');
    expect(matchRoutine('open spotify', list)).toBeUndefined();
    expect(matchRoutine('I need to focus on my essay today', list)).toBeUndefined();
    expect(findRoutine('focus', list)?.id).toBe('focus-mode');
    expect(findRoutine('Focus Mode routine', list)?.id).toBe('focus-mode');
    expect(findRoutine('morning', list)?.id).toBe('morning-briefing');
    expect(findRoutine('gaming', list)).toBeUndefined();
  });

  it('turns steps into the same commands chat uses', () => {
    const cmd = (s: Parameters<typeof stepIntent>[0]) => {
      const i = stepIntent(s);
      return i && toCommand(i, 'c');
    };
    expect(cmd({ kind: 'set_volume', target: 'Mute' })).toMatchObject({
      action: 'set_volume',
      args: ['mute'],
    });
    expect(cmd({ kind: 'set_volume', target: '40' })).toMatchObject({
      action: 'set_volume',
      target: '40',
    });
    expect(cmd({ kind: 'set_timer', target: '25', label: 'Break' })).toMatchObject({
      action: 'set_timer',
      target: '25',
      args: ['Break'],
    });
    expect(cmd({ kind: 'close_app', target: 'Discord' })).toMatchObject({
      action: 'close_app',
      risk: 'destructive',
    });
    expect(cmd({ kind: 'open_folder', target: 'downloads' })?.action).toBe('open_folder');
    expect(cmd({ kind: 'lock_screen' })?.action).toBe('lock_screen');
    expect(cmd({ kind: 'say', target: 'hi' })).toBeNull();
    expect(cmd({ kind: 'briefing' })).toBeNull();
    expect(canonIntent('run_routine')).toBe('run_routine');
  });

  it('flags steps that cannot run, and describes them', () => {
    expect(stepProblem({ kind: 'set_volume', target: '140' })).toMatch(/0 to 100/);
    expect(stepProblem({ kind: 'set_volume', target: 'unmute' })).toBeNull();
    expect(stepProblem({ kind: 'set_timer', target: 'soon' })).toMatch(/Minutes/);
    expect(stepProblem({ kind: 'wait', target: '600' })).toMatch(/Seconds/);
    expect(stepProblem({ kind: 'launch_app', target: ' ' })).toMatch(/filled in/);
    expect(stepProblem({ kind: 'media_control', target: 'next' })).toBeNull();
    expect(stepProblem({ kind: 'briefing' })).toBeNull();
    expect(describeStep({ kind: 'set_volume', target: 'mute' })).toBe('Mute sound');
    expect(describeStep({ kind: 'media_control', target: 'play_pause' })).toBe(
      'Music control · Play / pause',
    );
    expect(describeStep({ kind: 'set_timer', target: '25', label: 'Break' })).toBe(
      'Start timer · 25 min · Break',
    );
  });
});

describe('buildBriefing', () => {
  const at9 = new Date(2026, 10, 18, 8, 30).getTime();
  const hhmm = new Date(at9).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const stats = (patch: Partial<SystemStats> = {}): SystemStats =>
    ({
      cpu: { load: 10, cores: [], speedGHz: 3, temp: 50 },
      memory: { used: 4e9, total: 16e9, swapUsed: 0, swapTotal: 0 },
      gpu: null,
      network: {} as SystemStats['network'],
      disks: [{ id: 'c', mount: 'C:', label: '', kind: 'ssd', size: 100, used: 50 }],
      processes: [],
      battery: null,
      uptime: 3600,
      timestamp: 0,
      ...patch,
    }) as SystemStats;
  const wx: WeatherData = {
    place: { name: 'Leeds', lat: 1, lon: 1 },
    units: { temp: 'c', wind: 'mph' },
    fetchedAt: at9,
    current: {
      temp: 7.6,
      feels: 4,
      humidity: 80,
      code: 61,
      isDay: true,
      windSpeed: 10,
      windDir: 0,
      precipitation: 0,
    },
    hourly: [{ time: '2026-11-18T09:00', hour: 9, temp: 8, code: 61, rainChance: 80 }],
    today: { max: 10, min: 2, rainChance: 80, sunrise: null, sunset: null },
    tomorrow: null,
  };
  const timer: TimerInfo = {
    id: 't',
    label: 'check the oven',
    durationMs: 1,
    createdAt: 0,
    dueAt: at9 + 12 * 60_000,
    status: 'running',
  };
  const base = {
    now: at9,
    personality: { ...DEFAULT_PERSONALITY, userTitle: 'sir' },
    userName: '',
    weatherConfigured: true,
  };

  it('greets, gives weather with umbrella advice, timers and a healthy PC', () => {
    const text = buildBriefing({ ...base, weather: wx, timers: [timer], stats: stats() });
    expect(text.startsWith(`Good morning, sir. It's ${hhmm} on Wednesday`)).toBe(true);
    expect(text).toMatch(
      /In Leeds it's 8°C and light rain, with a high of 10°C and a low of 2°C\./,
    );
    expect(text).toMatch(/80% chance of rain .* take an umbrella/);
    expect(text).toMatch(/1 timer running; “check the oven” ends in 12 minutes\./);
    expect(text).toMatch(/Your PC looks healthy\.$/);
  });

  it('lists PC problems and handles missing weather', () => {
    const text = buildBriefing({
      ...base,
      weather: null,
      weatherConfigured: false,
      timers: [],
      stats: stats({
        disks: [{ id: 'c', mount: 'C:', label: '', kind: 'ssd', size: 100, used: 95 }],
        memory: { used: 15e9, total: 16e9, swapUsed: 0, swapTotal: 0 },
        uptime: 9 * 86_400,
      }),
    });
    expect(text).toMatch(/Add your town in Settings/);
    expect(text).toMatch(
      /On your PC, drive C: is 95% full, memory is 94% used and it hasn't restarted in 9 days/,
    );
    expect(text).not.toMatch(/timer/);
  });

  it('is short for terse personalities', () => {
    const text = buildBriefing({
      ...base,
      personality: { ...DEFAULT_PERSONALITY, verbosity: 1 },
      weather: wx,
      timers: [],
      stats: stats(),
    });
    expect(text).toBe(`${hhmm}. 8°C, light rain. Rain 80%.`);
  });
});

describe('RoutineService', () => {
  function service(opts: { file?: string; fail?: string[] } = {}) {
    let now = new Date(2026, 10, 18, 9).getTime();
    const ran: CanonicalCommand[] = [];
    const progress: RoutineProgress[] = [];
    const onChange = vi.fn();
    const svc = new RoutineService({
      file: opts.file ?? tmp(),
      now: () => now,
      execute: vi.fn(async (cmd: CanonicalCommand) => {
        ran.push(cmd);
        const bad = opts.fail?.includes(cmd.target ?? '');
        return {
          commandId: cmd.id,
          status: bad ? ('failed' as const) : ('success' as const),
          message: bad ? `${cmd.target} not found` : 'ok',
          timestamp: now,
        };
      }),
      briefing: () => 'Morning!',
      onChange,
      onProgress: (p) => progress.push(p),
      sleep: async () => undefined,
    });
    svc.load();
    return { svc, ran, progress, onChange, tick: (ms: number) => (now += ms) };
  }

  it('starts with the example routines and saves them', () => {
    const file = tmp();
    const { svc } = service({ file });
    expect(svc.list().map((r) => r.name)).toEqual(['Morning briefing', 'Focus mode', 'Wind down']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(3);
  });

  it('keeps a user who deleted everything at zero routines', () => {
    const file = tmp();
    writeFileSync(file, '[]');
    expect(service({ file }).svc.list()).toEqual([]);
  });

  it('creates, updates and removes routines', () => {
    const { svc, onChange } = service();
    const list = svc.upsert({ ...focus, id: '__new__', name: 'Focus mode' });
    const added = list.at(-1);
    expect(added?.id).toBe('focus-mode-2');
    svc.upsert({ ...added, name: 'Deep work' });
    expect(svc.list().find((r) => r.id === 'focus-mode-2')?.name).toBe('Deep work');
    svc.remove('focus-mode-2');
    expect(svc.list().some((r) => r.id === 'focus-mode-2')).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(() => svc.upsert({ name: '' })).toThrow(/needs a name/);
  });

  it('runs steps in order, says lines, and reports progress', async () => {
    const { svc, ran, progress } = service();
    svc.upsert({ ...focus });
    const id =
      svc
        .list()
        .find(
          (r) =>
            r.name === 'Focus mode' && r.steps.length === 3 && r.steps[1]?.target === 'Spotify',
        )?.id ?? '';
    const res = await svc.run(id, 'cmd1');
    expect(res).toMatchObject({
      commandId: 'cmd1',
      status: 'success',
      message: 'Ran “Focus mode”: all 3 steps done.',
    });
    expect(ran.map((c) => [c.action, c.target])).toEqual([
      ['set_volume', '30'],
      ['launch_app', 'Spotify'],
    ]);
    expect(progress.filter((p) => p.status !== 'running').map((p) => p.status)).toEqual([
      'success',
      'success',
      'success',
    ]);
    expect(progress.find((p) => p.say)?.say).toBe('Go!');
    expect(svc.list().find((r) => r.id === id)?.lastRun).toBeGreaterThan(0);
  });

  it('keeps going after a failed step and explains it', async () => {
    const { svc, ran } = service({ fail: ['Spotify'] });
    const r = svc.upsert({ ...focus, id: 'new', name: 'Mix' }).find((x) => x.name === 'Mix');
    const res = await svc.run(r?.id ?? '');
    expect(ran).toHaveLength(2);
    expect(res.status).toBe('success');
    expect(res.message).toMatch(/2 of 3 steps done\. Open app · Spotify: Spotify not found/);
  });

  it('skips invalid steps, runs the briefing, and refuses empty or unknown routines', async () => {
    const { svc, progress } = service();
    const list = svc.upsert({
      name: 'Odd',
      steps: [{ kind: 'set_volume', target: '900' }, { kind: 'briefing' }],
    });
    const odd = list.find((x) => x.name === 'Odd');
    const res = await svc.run(odd?.id ?? '');
    expect(res.message).toMatch(/1 of 2 steps done\. Volume to 900%: Use a number/);
    expect(progress.find((p) => p.say)?.say).toBe('Morning!');
    const empty = svc.upsert({ name: 'Empty', steps: [] }).find((x) => x.name === 'Empty');
    expect((await svc.run(empty?.id ?? '')).message).toMatch(/has no steps/);
    expect((await svc.run('nope')).status).toBe('failed');
  });

  it('runs one routine at a time and can stop between steps', async () => {
    let release: () => void = () => undefined;
    const file = tmp();
    const svc = new RoutineService({
      file,
      execute: (cmd) =>
        new Promise((resolve) => {
          release = () =>
            resolve({ commandId: cmd.id, status: 'success', message: 'ok', timestamp: 0 });
        }),
      briefing: () => '',
      onChange: () => undefined,
      onProgress: () => undefined,
    });
    svc.load();
    const id =
      svc.upsert({ ...focus, id: 'n', name: 'Long' }).find((x) => x.name === 'Long')?.id ?? '';
    const first = svc.run(id);
    expect(svc.runningId()).toBe(id);
    expect((await svc.run(id)).message).toMatch(/Another routine/);
    svc.stop();
    release();
    expect((await first).message).toBe('Stopped “Long” after 1 of 3 steps.');
    expect(svc.runningId()).toBeNull();
  });

  it('offers startup routines once a day', async () => {
    const { svc, tick } = service();
    const b = svc.list()[0];
    svc.upsert({ ...b, runAtStartup: true });
    expect(svc.dueAtStartup().map((r) => r.id)).toEqual(['morning-briefing']);
    await svc.run('morning-briefing');
    expect(svc.dueAtStartup()).toEqual([]);
    tick(24 * 3600_000);
    expect(svc.dueAtStartup()).toHaveLength(1);
  });

  it('gives Claude run_routine and list_routines', () => {
    expect(toIntent('run_routine', { name: 'focus' })).toEqual({
      intent: { action: 'run_routine', target: 'focus' },
    });
    expect(toIntent('run_routine', {})).toEqual({ error: 'Missing "name".' });
    expect(toIntent('list_routines', {})).toEqual({ local: 'list_routines' });
  });
});
