/** Keeping Vortex in step with Alton, through Vortex's own command line (Vortex.exe --get /
 *  --set), only while Vortex and the game are closed, after backing up Vortex's state:
 *  - mods Alton took out are switched off in Vortex (their files go back where Vortex expects
 *    them, so its next deploy removes them itself instead of asking about "external changes");
 *  - "Put back" switches them on again;
 *  - file conflicts between enabled mods get "which wins" rules (patches, then the newer mod);
 *  - Vortex's automatic install / enable / deploy are switched on.
 *  While Alton is updating mods it also presses Continue on Vortex's "already installed"
 *  question (Replace is already the selected answer), using Windows UI Automation. */
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { escPath, fileConflicts, hasRule, parseGet, type VortexRule } from '@shared/vortex';
import { QUARANTINE } from '@shared/cpoutdated';
import type { CyberpunkMods } from './cyberpunk-mods';

const GAME = 'cyberpunk2077';

interface Pending {
  /** Vortex mod ids to switch on again (Put back). */
  enable: string[];
  lastRun: { at: number; message: string; ok: boolean } | null;
  /** Rules Alton added: winner id → loser ids (so they can be listed). */
  rulesAdded: Array<{ winner: string; loser: string; reason: string; at: number }>;
}

const run = (
  file: string,
  args: string[],
  timeout = 120_000,
): Promise<{ out: string; err: string }> =>
  new Promise((resolve) =>
    execFile(
      file,
      args,
      { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024 },
      (_e, out, err) => resolve({ out: String(out ?? ''), err: String(err ?? '') }),
    ),
  );

export class VortexSync {
  private file = join(app.getPath('userData'), 'vortex-sync.json');
  private clicker: ChildProcess | null = null;
  private busy = false;

  constructor(private readonly mods: CyberpunkMods) {}

  state(): Pending {
    try {
      const j = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Pending>;
      return { enable: j.enable ?? [], lastRun: j.lastRun ?? null, rulesAdded: j.rulesAdded ?? [] };
    } catch {
      return { enable: [], lastRun: null, rulesAdded: [] };
    }
  }
  private save(p: Pending): void {
    writeFileSync(this.file, JSON.stringify(p));
  }

  async vortexRunning(): Promise<boolean> {
    const { out } = await run('tasklist', ['/FI', 'IMAGENAME eq Vortex.exe', '/NH'], 10_000);
    return /Vortex\.exe/i.test(out);
  }

  /** Put back a mod that was switched off in Vortex: switched on again at the next sync. */
  queueEnable(ids: string[]): void {
    const p = this.state();
    p.enable = [...new Set([...p.enable, ...ids])];
    this.save(p);
  }

  /** Is there anything to do (saved mods not yet off in Vortex, or mods to switch back on)? */
  due(): boolean {
    return this.state().enable.length > 0 || this.mods.removed().some((r) => !r.vortexOff);
  }

  private backup(): void {
    const src = join(process.env.APPDATA ?? '', 'Vortex', 'state.v2');
    if (!existsSync(src)) throw new Error('Vortex’s state folder isn’t where expected');
    const root = join(app.getPath('userData'), 'vortex-backups');
    mkdirSync(root, { recursive: true });
    cpSync(src, join(root, new Date().toISOString().replace(/[:.]/g, '-')), { recursive: true });
    for (const old of readdirSync(root).sort().slice(0, -3))
      rmSync(join(root, old), { recursive: true, force: true });
  }

  /** Bring Vortex in step (see the top of this file). Only while Vortex and the game are closed. */
  async sync(force = false): Promise<{ ok: boolean; message: string }> {
    if (this.busy) return { ok: false, message: 'Already updating Vortex.' };
    if (await this.vortexRunning())
      return { ok: false, message: 'Waiting for Vortex to be closed.' };
    if (await this.mods.gameRunning())
      return { ok: false, message: 'Waiting for Cyberpunk to be closed.' };
    if (!force && !this.due()) return { ok: true, message: 'Nothing to change in Vortex.' };
    this.busy = true;
    const p = this.state();
    try {
      const exe = await this.mods.vortexExe();
      const game = await this.mods.findGame();
      if (!game) throw new Error('Cyberpunk 2077 wasn’t found');
      this.backup();
      const get = async (paths: string[]): Promise<Map<string, unknown>> => {
        const out = new Map<string, unknown>();
        for (let i = 0; i < paths.length; i += 40) {
          const r = await run(
            exe,
            paths.slice(i, i + 40).flatMap((x) => ['--get', x]),
          );
          for (const [k, v] of parseGet(r.out)) out.set(k, v);
        }
        return out;
      };
      const set = async (pairs: Array<[string, string]>): Promise<void> => {
        for (let i = 0; i < pairs.length; i += 30) {
          const r = await run(
            exe,
            pairs.slice(i, i + 30).flatMap(([k, v]) => ['--set', `${k}=${v}`]),
          );
          if (r.err.trim()) throw new Error(`Vortex said: ${r.err.trim().slice(0, 200)}`);
        }
      };
      const profileKey = `settings.profiles.lastActiveProfile.${GAME}`;
      const profileId = (await get([profileKey])).get(profileKey);
      if (typeof profileId !== 'string' || !profileId)
        throw new Error('couldn’t read Vortex’s active Cyberpunk profile');
      const modStatePrefix = `persistent.profiles.${escPath(profileId)}.modState`;
      const enabledKey = (id: string): string => `${modStatePrefix}.${escPath(id)}.enabled`;
      const pairs: Array<[string, string]> = [];

      // 1. Saved (removed) mods: files back where Vortex expects them, switched off in Vortex.
      const removed = this.mods.removed();
      const toOff = removed.filter((r) => !r.vortexOff);
      for (const r of toOff) {
        for (const rel of r.files) {
          const from = join(game, QUARANTINE, r.folder, rel);
          const to = join(game, rel);
          try {
            if (existsSync(to) || !existsSync(from)) continue;
            mkdirSync(join(to, '..'), { recursive: true });
            renameSync(from, to);
          } catch {
            /* stays saved */
          }
        }
        pairs.push([enabledKey(r.folder), 'false']);
      }
      // 2. Put back: switch on again.
      for (const id of p.enable) pairs.push([enabledKey(id), 'true']);

      // 3. Which mods are enabled now (after the changes above), and their conflicts.
      const states = await get([modStatePrefix]);
      const enabled = new Set<string>();
      const pre = `${modStatePrefix.replace(/\\\./g, '.')}.`;
      for (const [k, v] of states)
        if (k.startsWith(pre) && k.endsWith('.enabled') && v === true)
          enabled.add(k.slice(pre.length, -'.enabled'.length));
      for (const r of toOff) enabled.delete(r.folder);
      for (const id of p.enable) enabled.add(id);
      const list = this.mods.list().filter((m) => enabled.has(m.folder));
      const conflicts = fileConflicts(
        list.map((m) => ({
          id: m.folder,
          name: m.name,
          files: this.mods.modFiles(m.folder),
          installedAt: m.installedAt,
        })),
      );
      const involved = [...new Set(conflicts.flatMap((c) => [c.winner, c.loser]))];
      const rulesKey = (id: string): string => `persistent.mods.${GAME}.${escPath(id)}.rules`;
      const ruleMap = await get(involved.map(rulesKey));
      const rulesOf = new Map<string, VortexRule[]>();
      for (const id of involved) {
        const v = ruleMap.get(`persistent.mods.${GAME}.${id}.rules`);
        rulesOf.set(id, Array.isArray(v) ? (v as VortexRule[]) : []);
      }
      const added: Pending['rulesAdded'] = [];
      for (const c of conflicts) {
        const w = rulesOf.get(c.winner) ?? [];
        if (hasRule(w, rulesOf.get(c.loser) ?? [], c.winner, c.loser)) continue;
        w.push({ type: 'after', reference: { id: c.loser } });
        rulesOf.set(c.winner, w);
        added.push({ winner: c.winner, loser: c.loser, reason: c.reason, at: Date.now() });
      }
      for (const id of new Set(added.map((a) => a.winner))) {
        const json = JSON.stringify(rulesOf.get(id) ?? []);
        if (json.includes('=')) continue; // Vortex's --set splits on "="
        pairs.push([rulesKey(id), json]);
      }
      // 4. Let Vortex install, enable and deploy by itself.
      for (const k of ['install', 'enable', 'deploy'])
        pairs.push([`settings.automation.${k}`, 'true']);

      await set(pairs.filter(([, v]) => !v.includes('=')));
      // Check it took (the mod switches are what matter most).
      const check = await get(toOff.map((r) => enabledKey(r.folder)));
      const notOff = toOff.filter(
        (r) => check.get(enabledKey(r.folder).replace(/\\\./g, '.')) === true,
      );
      const saved = this.mods
        .removed()
        .map((r) =>
          toOff.some((t) => t.folder === r.folder) && !notOff.some((n) => n.folder === r.folder)
            ? { ...r, vortexOff: true }
            : r,
        );
      this.mods.saveRemoved(saved.filter((r) => !p.enable.includes(r.folder)));
      const msg = [
        toOff.length
          ? `Switched off ${toOff.length - notOff.length} saved mod${toOff.length === 1 ? '' : 's'} in Vortex.`
          : '',
        p.enable.length ? `Switched ${p.enable.length} back on.` : '',
        added.length
          ? `Settled ${added.length} file conflict${added.length === 1 ? '' : 's'}.`
          : '',
        notOff.length ? `${notOff.length} couldn’t be switched off: they stay saved by Alton.` : '',
        'Vortex will tidy up on its next deploy.',
      ]
        .filter(Boolean)
        .join(' ');
      const next: Pending = {
        enable: [],
        lastRun: { at: Date.now(), message: msg, ok: true },
        rulesAdded: [...p.rulesAdded, ...added].slice(-300),
      };
      this.save(next);
      return { ok: true, message: msg };
    } catch (e) {
      const msg = `Couldn’t update Vortex: ${e instanceof Error ? e.message : 'error'}. Nothing was changed by the parts that failed; a backup of Vortex’s state is in Alton’s data folder.`;
      this.save({ ...p, lastRun: { at: Date.now(), message: msg, ok: false } });
      return { ok: false, message: msg };
    } finally {
      this.busy = false;
    }
  }

  /** While updates install: press Continue on Vortex's "already installed" question (Replace is
   *  the selected answer) for the next `minutes`. */
  autoReplace(minutes = 20): void {
    if (this.clicker && this.clicker.exitCode === null) return;
    const ps = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]::Descendants
$stop = (Get-Date).AddMinutes(${Math.max(1, Math.min(120, Math.round(minutes)))})
while ((Get-Date) -lt $stop) {
  foreach ($p in Get-Process Vortex -ErrorAction SilentlyContinue) {
    if ($p.MainWindowHandle -eq 0) { continue }
    try {
      $root = $A::FromHandle($p.MainWindowHandle)
      $q = $root.FindFirst($T, (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Install options')))
      if ($q) {
        $text = $root.FindAll($T, [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -like '*is already installed*' } | Select-Object -First 1
        if ($text) {
          $c = New-Object System.Windows.Automation.AndCondition(
            (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, 'Continue')),
            (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
          $b = $root.FindFirst($T, $c)
          if ($b) { $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); Start-Sleep -Milliseconds 800 }
        }
      }
    } catch {}
  }
  Start-Sleep -Milliseconds 1500
}`;
    this.clicker = spawn(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        Buffer.from(ps, 'utf16le').toString('base64'),
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    this.clicker.on('exit', () => {
      this.clicker = null;
    });
  }
}
