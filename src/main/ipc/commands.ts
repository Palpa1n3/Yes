import { app, shell } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalCommand, CommandResult } from '@shared/commands';
import { IPC } from '@shared/ipc';
import { USER_FOLDERS, type FolderInfo, type UserFolder } from '@shared/types';
import { AppRegistry } from '../services/app-registry';
import { createExecutor } from '../services/command-executor';
import { osDeps } from '../services/os-launch';
import { SkillRegistry } from '../services/skills';
import { createSystemActions, isSafeProcessName } from '../services/system-actions';
import { TaskManager } from '../services/task-manager';
import { sampleWindowsProcesses } from '../services/win-processes';
import type { EndTaskResult } from '@shared/tasks';
import si from 'systeminformation';
import type { TimerService } from '../services/timer-service';
import { handle, on } from './handle';

const FOLDER_NAMES: Record<UserFolder, string> = {
  documents: 'Documents',
  downloads: 'Downloads',
  desktop: 'Desktop',
  pictures: 'Pictures',
  videos: 'Videos',
  music: 'Music',
};

export interface CommandsIpc {
  /** Run one command (skills first, then the built-in executor). */
  execute(cmd: CanonicalCommand): Promise<CommandResult>;
  /** Wire run_routine to the routine runner (created after this). */
  setRoutineRunner(run: (cmd: CanonicalCommand) => Promise<CommandResult>): void;
}

export function registerCommandsIpc(skills: SkillRegistry, timers: TimerService): CommandsIpc {
  const registry = new AppRegistry(join(app.getPath('userData'), 'apps.json'));
  registry.load();
  const system = createSystemActions({
    platform: process.platform,
    getPath: (id) => app.getPath(id),
    openPath: (p) => shell.openPath(p),
    showItemInFolder: (p) => shell.showItemInFolder(p),
    timers,
  });
  const deps = { ...osDeps(), registry, system };
  const execute = createExecutor(deps);

  // Skills get first refusal; anything they don't claim goes to the built-in executor.
  const executeAny = async (cmd: CanonicalCommand): Promise<CommandResult> =>
    (await skills.handle(cmd)) ?? execute(cmd);
  let runRoutine: ((cmd: CanonicalCommand) => Promise<CommandResult>) | null = null;

  handle(IPC.commands.execute, async (cmd) => {
    registry.load(); // pick up edits to apps.json without restarting
    if (cmd.action === 'run_routine' && runRoutine) return runRoutine(cmd);
    return executeAny(cmd);
  });

  // Task Manager tab.
  const tasks = new TaskManager({
    sample:
      process.platform === 'win32'
        ? () => sampleWindowsProcesses()
        : async () =>
            (await si.processes()).list.map((p) => ({
              pid: p.pid,
              name: p.name,
              cpuSec: 0,
              cpuPct: Math.max(0, p.cpu),
              mem: p.memRss * 1024,
            })),
    isProtected: (n) => !isSafeProcessName(n),
  });
  handle(IPC.tasks.list, () => tasks.list());
  handle(IPC.tasks.end, async (rawName, force): Promise<EndTaskResult> => {
    const name = String(rawName).replace(/\.exe$/i, '');
    if (!isSafeProcessName(name))
      return {
        ok: false,
        message: `${name} is part of Windows or ARC, so it can't be ended here.`,
      };
    if (process.platform !== 'win32')
      return { ok: false, message: 'Ending tasks is only available on Windows.' };
    if (force) return system.forceEnd(name);
    const r = await system.closeApp([name]);
    return r.ok ? r : { ...r, canForce: !/doesn't seem to be running/.test(r.message) };
  });

  handle(IPC.apps.list, () => registry.load());
  handle(IPC.apps.installed, async () =>
    (await deps.listStartApps()).sort((a, b) => a.name.localeCompare(b.name)),
  );
  handle(IPC.apps.save, (entry) => registry.upsert(entry));
  handle(IPC.apps.remove, (id) => registry.remove(id));

  handle(IPC.apps.folders, (): FolderInfo[] =>
    USER_FOLDERS.map((id) => {
      const path = app.getPath(id);
      return { id, name: FOLDER_NAMES[id], path, exists: existsSync(path) };
    }),
  );
  // Fixed set of well-known folders only: never an arbitrary path from the renderer.
  on(
    IPC.apps.openFolder,
    (_w, folder) => {
      if ((USER_FOLDERS as readonly string[]).includes(folder))
        void shell.openPath(app.getPath(folder));
    },
    () => null,
  );
  return {
    execute: executeAny,
    setRoutineRunner: (run) => {
      runRoutine = run;
    },
  };
}
