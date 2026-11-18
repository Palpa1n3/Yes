import { describe, expect, it } from 'vitest';
import { friendlyName, groupTasks, sortTasks, type ProcSample } from '@shared/tasks';
import {
  describeSchedule,
  sanitizeRoutine,
  sanitizeSchedule,
  scheduleMatches,
} from '@shared/routines';
import { RoutineService } from '../../src/main/services/routine-service';
import { isSafeProcessName } from '../../src/main/services/system-actions';
import { TaskManager } from '../../src/main/services/task-manager';
import { parseSample } from '../../src/main/services/win-processes';

const prot = (n: string): boolean => !isSafeProcessName(n);

describe('Task Manager grouping', () => {
  const prev: ProcSample[] = [
    { pid: 1, name: 'chrome', cpuSec: 10, mem: 100 },
    { pid: 2, name: 'chrome', cpuSec: 5, mem: 100 },
    { pid: 3, name: 'svchost', cpuSec: 1, mem: 10 },
  ];
  const cur: ProcSample[] = [
    { pid: 1, name: 'chrome', cpuSec: 12, mem: 200, window: true, responding: true },
    { pid: 2, name: 'chrome', cpuSec: 6, mem: 300, window: false, responding: true },
    { pid: 3, name: 'svchost', cpuSec: 1.2, mem: 20 },
    { pid: 4, name: 'Discord', cpuSec: 0, mem: 50, window: true, responding: false },
    { pid: 5, name: 'node.exe', cpuSec: 0, mem: 5 },
    { pid: 0, name: 'Idle', cpuSec: 999, mem: 0 },
  ];

  it('groups by app with CPU from the change between samples', () => {
    const list = groupTasks(prev, cur, 1, 4, prot);
    const by = (n: string) => list.find((t) => t.name.toLowerCase() === n);
    expect(by('chrome')).toMatchObject({
      label: 'Google Chrome',
      count: 2,
      mem: 500,
      kind: 'app',
      cpu: 75,
    });
    expect(by('svchost')).toMatchObject({ kind: 'windows', protected: true, cpu: 5 });
    expect(by('discord')).toMatchObject({ kind: 'app', responding: false, protected: false });
    expect(by('node')).toMatchObject({ name: 'node', label: 'Node.js', kind: 'background' });
    expect(list.some((t) => /idle/i.test(t.name))).toBe(false);
  });

  it('sorts by CPU, memory or name', () => {
    const list = groupTasks(prev, cur, 1, 4, prot);
    expect(sortTasks(list, 'cpu', true)[0]?.name).toBe('chrome');
    expect(sortTasks(list, 'mem', false)[0]?.name).toBe('node');
    expect(sortTasks(list, 'name', false).map((t) => t.label)[0]).toBe('Discord');
  });

  it('names well-known apps', () => {
    expect(friendlyName('msedge.exe')).toBe('Microsoft Edge');
    expect(friendlyName('SomeTool')).toBe('SomeTool');
  });

  it('reads window and responding flags from Get-Process', () => {
    expect(parseSample('[{"i":4,"n":"Discord","c":1.5,"m":9,"w":1,"r":0}]')).toEqual([
      { pid: 4, name: 'Discord', cpuSec: 1.5, mem: 9, window: true, responding: false },
    ]);
    expect(parseSample('{"i":1,"n":"x","c":null,"m":1}')).toEqual([
      { pid: 1, name: 'x', cpuSec: 0, mem: 1 },
    ]);
  });

  it('needs a baseline sample first, unless the source gives CPU% directly', async () => {
    let t = 0;
    const samples = [prev, cur];
    const tm = new TaskManager({
      sample: async () => samples.shift() ?? cur,
      isProtected: prot,
      now: () => (t += 1000),
      threads: 4,
    });
    expect((await tm.list()).tasks).toBeNull();
    expect((await tm.list()).tasks?.length).toBe(4);
    const direct = new TaskManager({
      sample: async () => [{ pid: 9, name: 'bash', cpuSec: 0, cpuPct: 12.34, mem: 1 }],
      isProtected: prot,
    });
    expect((await direct.list()).tasks?.[0]).toMatchObject({ name: 'bash', cpu: 12.3 });
  });

  it('never lets Windows or ARC be ended', () => {
    for (const n of ['svchost', 'explorer.exe', 'csrss', 'ARC', 'electron'])
      expect(isSafeProcessName(n)).toBe(false);
    expect(isSafeProcessName('Discord')).toBe(true);
  });
});

describe('Timed routines', () => {
  it('validates and describes schedules', () => {
    expect(sanitizeSchedule({ time: '8:05', days: [5, 1, 1, 9, 'x'] })).toEqual({
      time: '08:05',
      days: [1, 5],
    });
    expect(sanitizeSchedule({ time: '25:00', days: [1] })).toBeUndefined();
    expect(sanitizeSchedule({ time: '08:00', days: [] })).toBeUndefined();
    expect(describeSchedule({ time: '08:30', days: [1, 2, 3, 4, 5] })).toBe('Weekdays at 08:30');
    expect(describeSchedule({ time: '23:00', days: [0, 1, 2, 3, 4, 5, 6] })).toBe(
      'Every day at 23:00',
    );
    expect(describeSchedule({ time: '10:00', days: [0, 6] })).toBe('Weekends at 10:00');
    expect(describeSchedule({ time: '07:15', days: [1, 4] })).toBe('Mon, Thu at 07:15');
    expect(
      sanitizeRoutine({ name: 'X', steps: [], schedule: { time: '07:00', days: [1] } })?.schedule,
    ).toEqual({ time: '07:00', days: [1] });
  });

  it('matches the right minute and day', () => {
    const wed830 = new Date(2026, 10, 18, 8, 30, 40);
    expect(scheduleMatches({ time: '08:30', days: [3] }, wed830)).toBe(true);
    expect(scheduleMatches({ time: '08:30', days: [4] }, wed830)).toBe(false);
    expect(scheduleMatches({ time: '08:31', days: [3] }, wed830)).toBe(false);
  });

  it('reports due routines once, not again right after they ran', async () => {
    let now = new Date(2026, 10, 18, 8, 30, 5).getTime();
    const svc = new RoutineService({
      now: () => now,
      execute: async (cmd) => ({
        commandId: cmd.id,
        status: 'success',
        message: 'ok',
        timestamp: 0,
      }),
      briefing: () => 'hi',
      onChange: () => undefined,
      onProgress: () => undefined,
    });
    svc.load();
    svc.upsert({
      name: 'Morning',
      steps: [{ kind: 'say', target: 'Morning' }],
      schedule: { time: '08:30', days: [3] },
    });
    const due = svc.dueNow();
    expect(due.map((r) => r.name)).toEqual(['Morning']);
    await svc.run(due[0]?.id ?? '');
    now += 30_000;
    expect(svc.dueNow()).toEqual([]);
    now += 60_000; // 08:31
    expect(svc.dueNow()).toEqual([]);
  });
});
