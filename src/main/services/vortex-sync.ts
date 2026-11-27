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
  statSync,
  unlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import {
  escPath,
  fileConflicts,
  hasRule,
  olderDuplicates,
  parseGet,
  lastProfileSwitch,
  sameDownloadCopies,
  type VortexEntry,
  type VortexRule,
} from '@shared/vortex';
import { QUARANTINE } from '@shared/cpoutdated';
import { jobLocks } from './job-locks';
import type { CyberpunkMods } from './cyberpunk-mods';

const GAME = 'cyberpunk2077';

interface Pending {
  /** Vortex mod ids to switch on again (Put back). */
  enable: string[];
  lastRun: { at: number; message: string; ok: boolean } | null;
  /** Rules Alton added: winner id → loser ids (so they can be listed). */
  rulesAdded: Array<{ winner: string; loser: string; reason: string; at: number }>;
  /** Alton changed Vortex while it was closed: deploy the next time it opens. */
  needsDeploy?: boolean;
  /** The Cyberpunk profile Alton changed (Vortex's active one at the last sync). */
  profileId?: string;
  /** Last time Vortex was found on another game or profile, so Alton didn't deploy. */
  wrongProfile?: { at: number; gameId: string; profile: string } | null;
  /** Duplicate entries Alton took out of Vortex (folders kept in OLD_COPIES). */
  tidied?: Array<{ id: string; at: number }>;
}

/** Next to Vortex's Cyberpunk mods folder: old duplicate copies' files, kept. */
const OLD_COPIES = '_alton_old_copies';

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
      return {
        enable: j.enable ?? [],
        lastRun: j.lastRun ?? null,
        rulesAdded: j.rulesAdded ?? [],
        needsDeploy: j.needsDeploy === true,
        tidied: j.tidied ?? [],
        ...(j.profileId ? { profileId: j.profileId } : {}),
        wrongProfile: j.wrongProfile ?? null,
      };
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

  /** Vortex's log, the last few MB. */
  private vortexLog(): string {
    try {
      const p = join(process.env.APPDATA ?? '', 'Vortex', 'vortex.log');
      const s = readFileSync(p);
      return s.subarray(Math.max(0, s.length - 4_000_000)).toString('utf8');
    } catch {
      return '';
    }
  }

  /** Wait (up to `waitMs`) for Vortex to settle on a profile; true when it's Cyberpunk on the
   *  profile Alton changed. Records where it was otherwise. */
  private async onRightProfile(since = 0, waitMs = 90_000): Promise<boolean> {
    const want = this.state().profileId;
    const stop = Date.now() + waitMs;
    for (;;) {
      const s = lastProfileSwitch(this.vortexLog());
      if (s && s.at >= since) {
        // A startup line names only the profile: it counts when it's the one Alton changed.
        const right =
          s.gameId === GAME ? !want || s.profile === want : !!want && s.profile === want;
        if (right) {
          if (this.state().wrongProfile) this.save({ ...this.state(), wrongProfile: null });
          return true;
        }
        if (!s.gameId && !want) {
          if (Date.now() > stop) return false;
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }
        this.save({
          ...this.state(),
          wrongProfile: { at: Date.now(), gameId: s.gameId, profile: s.profile },
        });
        // A switch may still be on its way (Vortex starts on one game, then moves).
        if (Date.now() > stop) return false;
      } else if (Date.now() > stop) return false;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }

  /** After Alton reopened Vortex: make sure it's on the right profile (putting it back once if
   *  Vortex lost it), then deploy. */
  private async afterReopen(exe: string, opened: number): Promise<void> {
    const want = this.state().profileId;
    if (await this.onRightProfile(opened - 5000)) {
      await this.deployWhenOpen();
      return;
    }
    if (!want) return;
    // Vortex lost track of Cyberpunk's profile while restarting: point it back, then reopen.
    await run('taskkill', ['/IM', 'Vortex.exe'], 15_000);
    for (let i = 0; i < 30 && (await this.vortexRunning()); i++)
      await new Promise((res) => setTimeout(res, 1000));
    if (await this.vortexRunning()) return;
    const v = JSON.stringify(want);
    await run(exe, [
      '--set',
      `settings.profiles.activeProfileId=${v}`,
      '--set',
      `settings.profiles.lastActiveProfile.${GAME}=${v}`,
      '--set',
      `settings.profiles.nextProfileId=${v}`,
    ]);
    const again = Date.now();
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    if (await this.onRightProfile(again - 5000)) await this.deployWhenOpen();
  }

  /** Saved mods' files that are in the game folder again (the very same file as the saved
   *  mod's copy in Vortex's staging folder, so a newer copy Vortex deployed is never touched)
   *  go back into the saved folder. If the saved folder already has that same file, the game's
   *  entry is only an extra link to it and is dropped (nothing is lost). Returns the count. */
  private clearSavedFromGame(game: string): number {
    const staging = this.mods.vortexDir();
    if (!staging) return 0;
    const id = (p: string): string | null => {
      try {
        const s = statSync(p, { bigint: true });
        return `${s.dev}:${s.ino}`;
      } catch {
        return null;
      }
    };
    let n = 0;
    for (const r of this.mods.removed())
      for (const rel of r.files) {
        const inGame = join(game, rel);
        const stage = id(join(staging, r.folder, rel));
        if (!stage || id(inGame) !== stage) continue;
        const saved = join(game, QUARANTINE, r.folder, rel);
        try {
          if (existsSync(saved)) {
            if (id(saved) !== stage) continue;
            unlinkSync(inGame);
          } else {
            mkdirSync(join(saved, '..'), { recursive: true });
            renameSync(inGame, saved);
          }
          n++;
        } catch {
          /* left as it is */
        }
      }
    return n;
  }

  /** Collection entries switched on in Vortex (they re-enable their mods when Vortex starts). */
  private async enabledCollections(
    get: (paths: string[]) => Promise<Map<string, unknown>>,
    enabled: Set<string>,
  ): Promise<string[]> {
    const all = await get([`persistent.mods.${GAME}`]);
    const pre = `persistent.mods.${GAME}.`;
    const out: string[] = [];
    for (const [k, v] of all)
      if (k.startsWith(pre) && k.endsWith('.type') && v === 'collection') {
        const modId = k.slice(pre.length, -'.type'.length);
        if (enabled.has(modId)) out.push(modId);
      }
    return out;
  }

  private applying = false;
  isApplying(): boolean {
    return this.applying;
  }

  /** Apply waiting changes now: if Vortex is open, close it politely (like its X button; never
   *  while Alton is updating mods through it), make the changes, open it again and deploy. */
  async applyNow(): Promise<{ ok: boolean; message: string }> {
    if (this.applying) return { ok: true, message: 'Already applying.' };
    if (!this.due()) return { ok: true, message: 'Nothing waiting for Vortex.' };
    if (await this.mods.gameRunning())
      return { ok: false, message: 'Waiting for Cyberpunk to be closed.' };
    if (this.mods.updatingNow())
      return { ok: false, message: 'Waiting for the updates to finish installing in Vortex.' };
    // Closing Vortex would cut off anything else using it.
    const lock = jobLocks.take(['vortex', 'cyberpunk-files'], 'Vortex sync', 15 * 60_000);
    if ('waitingFor' in lock) return { ok: false, message: `Waiting: ${lock.waitingFor}.` };
    this.applying = true;
    try {
      const wasOpen = await this.vortexRunning();
      if (wasOpen) {
        await run('taskkill', ['/IM', 'Vortex.exe'], 15_000);
        for (let i = 0; i < 30 && (await this.vortexRunning()); i++)
          await new Promise((res) => setTimeout(res, 1000));
        if (await this.vortexRunning())
          return {
            ok: false,
            message:
              'Vortex didn’t close (it may be asking something or busy): close it and Alton applies the changes.',
          };
      }
      const r = await this.sync(true);
      if (wasOpen) {
        try {
          const exe = await this.mods.vortexExe();
          const opened = Date.now();
          spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
          void this.afterReopen(exe, opened);
        } catch {
          /* reopen by hand */
        }
      }
      return {
        ok: r.ok,
        message: wasOpen
          ? `${r.message} Vortex was closed for this and is opening again.`
          : r.message,
      };
    } finally {
      lock.release();
      this.applying = false;
    }
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
    // Nothing else may use Vortex or the mod files meanwhile (an update installing, a fix…).
    const lock = jobLocks.take(['vortex', 'cyberpunk-files'], 'Vortex sync', 15 * 60_000);
    if ('waitingFor' in lock) return { ok: false, message: `Waiting: ${lock.waitingFor}.` };
    this.busy = true;
    // Alton's own changes (and the deploy that follows) aren't "unexpected".
    this.mods.expectChange(20 * 60_000);
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

      // Which mods Vortex has switched on right now.
      const states = await get([modStatePrefix]);
      const enabled = new Set<string>();
      const pre = `${modStatePrefix.replace(/\\\./g, '.')}.`;
      for (const [k, v] of states)
        if (k.startsWith(pre) && k.endsWith('.enabled') && v === true)
          enabled.add(k.slice(pre.length, -'.enabled'.length));

      // 1. Saved (removed) mods are switched off in Vortex: new ones, and any that something in
      //    Vortex switched back on (a collection re-enables its mods every time Vortex starts).
      //    Their files stay saved: never moved back into the game (Vortex may have forgotten
      //    them, and then they'd simply be active again).
      const removed = this.mods.removed();
      const toOff = removed.filter(
        (r) => !p.enable.includes(r.folder) && (!r.vortexOff || enabled.has(r.folder)),
      );
      const drift = toOff.filter((r) => r.vortexOff);
      for (const r of toOff) pairs.push([enabledKey(r.folder), 'false']);
      // Saved mods' files that are back in the game folder go back to the saved folder.
      const cleared = this.clearSavedFromGame(game);
      // A collection that keeps switching saved mods back on is switched off itself (it's only a
      // list; its mods stay installed and keep their own on/off).
      const collections = drift.length ? await this.enabledCollections(get, enabled) : [];
      for (const c of collections) pairs.push([enabledKey(c), 'false']);
      // 2. Put back: switch on again.
      for (const id of p.enable) pairs.push([enabledKey(id), 'true']);

      // 3. Which mods are enabled now (after the changes above), and their conflicts.
      for (const c of collections) enabled.delete(c);
      for (const r of toOff) enabled.delete(r.folder);
      for (const id of p.enable) enabled.add(id);
      let list = this.mods.list().filter((m) => enabled.has(m.folder));
      // Two versions of the same mod both on: switch the older copy off (not a rule).
      const dups = olderDuplicates(
        list.map((m) => ({
          id: m.folder,
          name: m.name,
          nexusId: m.modId,
          files: this.mods.modFiles(m.folder),
          installedAt: m.installedAt,
        })),
      );
      for (const d of dups) pairs.push([enabledKey(d.id), 'false']);
      list = list.filter((m) => !dups.some((d) => d.id === m.folder));
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

      const toWrite = pairs.filter(([, v]) => !v.includes('='));
      // Vortex only deploys by itself after changes made inside it: flag one as needed.
      if (toWrite.some(([k]) => !k.startsWith('settings.')))
        toWrite.push([`persistent.deployment.needToDeploy.${GAME}`, 'true']);
      await set(toWrite);
      // Read every change back: only what Vortex actually kept counts.
      // Vortex prints keys unescaped ("a\.b" → "a.b").
      const plain = (k: string): string => k.replace(/\\(.)/g, '$1');
      const back = await get(toWrite.map(([k]) => k));
      const kept = (k: string, v: string): boolean => {
        const got = back.get(plain(k));
        return got !== undefined && JSON.stringify(got) === JSON.stringify(JSON.parse(v));
      };
      const failed = toWrite.filter(([k, v]) => !kept(k, v));
      if (toWrite.length && failed.length === toWrite.length)
        throw new Error(
          'Vortex accepted the changes but didn’t keep any of them, so nothing was changed. Your Vortex may store its settings differently',
        );
      const notOff = toOff.filter((r) => !kept(enabledKey(r.folder), 'false'));
      const dupsOff = dups.filter((d) => kept(enabledKey(d.id), 'false'));
      const rulesKept = added.filter((a) =>
        kept(rulesKey(a.winner), JSON.stringify(rulesOf.get(a.winner) ?? [])),
      );
      const saved = this.mods
        .removed()
        .map((r) =>
          toOff.some((t) => t.folder === r.folder) && !notOff.some((n) => n.folder === r.folder)
            ? { ...r, vortexOff: true }
            : r,
        );
      this.mods.saveRemoved(saved.filter((r) => !p.enable.includes(r.folder)));
      // 5. Vortex's "Potential Duplicate Mods": extra entries made from the same download that
      //    are off everywhere. Their folders are moved aside (kept), then the entries go.
      let tidied: string[] = [];
      try {
        tidied = await this.tidyCopies(exe, get, [
          ...this.mods.removed().map((r) => r.folder),
          ...p.enable,
        ]);
      } catch {
        /* the rest still counts */
      }
      const msg = [
        toOff.length
          ? `Switched off ${toOff.length - notOff.length} saved mod${toOff.length === 1 ? '' : 's'} in Vortex.`
          : '',
        drift.length
          ? `${drift.length} saved mod${drift.length === 1 ? ' was' : 's were'} switched back on inside Vortex; switched off again.`
          : '',
        collections.length
          ? `Switched off the collection entr${collections.length === 1 ? 'y' : 'ies'} that kept switching saved mods back on (its mods stay installed).`
          : '',
        cleared
          ? `Took ${cleared} file${cleared === 1 ? '' : 's'} of saved mods back out of the game folder.`
          : '',
        p.enable.length ? `Switched ${p.enable.length} back on.` : '',
        dupsOff.length
          ? `Switched off ${dupsOff.length} older cop${dupsOff.length === 1 ? 'y' : 'ies'} of mods you have a newer version of (${dupsOff
              .slice(0, 6)
              .map((d) => d.name)
              .join(', ')}${dupsOff.length > 6 ? '…' : ''}).`
          : '',
        tidied.length
          ? `Took out ${tidied.length} duplicate entr${tidied.length === 1 ? 'y' : 'ies'} Vortex warned about (old copies that were already off; their files are kept in Vortex\\cyberpunk2077\\${OLD_COPIES}).`
          : '',
        rulesKept.length
          ? `Settled ${rulesKept.length} file conflict${rulesKept.length === 1 ? '' : 's'}.`
          : '',
        failed.length
          ? `${failed.length} change${failed.length === 1 ? '' : 's'} didn’t stick in Vortex.`
          : '',
        toWrite.length
          ? 'Open Vortex and press Deploy (or it deploys by itself after its next change) to apply it.'
          : 'Vortex is already in step.',
      ]
        .filter(Boolean)
        .join(' ');
      const next: Pending = {
        enable: [],
        lastRun: { at: Date.now(), message: msg, ok: true },
        rulesAdded: [...p.rulesAdded, ...rulesKept].slice(-300),
        needsDeploy: p.needsDeploy === true || toWrite.length > 3 || tidied.length > 0,
        tidied: [...(p.tidied ?? []), ...tidied.map((id) => ({ id, at: Date.now() }))].slice(-500),
        profileId,
      };
      this.save(next);
      return { ok: true, message: msg };
    } catch (e) {
      const msg = `Couldn’t update Vortex: ${e instanceof Error ? e.message : 'error'}. Nothing was changed by the parts that failed; a backup of Vortex’s state is in Alton’s data folder.`;
      this.save({ ...p, lastRun: { at: Date.now(), message: msg, ok: false } });
      return { ok: false, message: msg };
    } finally {
      lock.release();
      this.busy = false;
    }
  }

  /** Take out Vortex entries that duplicate another entry's download and are switched off in
   *  every profile (Vortex's "Potential Duplicate Mods"). Each folder is moved to OLD_COPIES
   *  first and moved back if Vortex doesn't drop the entry. Returns the ids taken out. */
  private async tidyCopies(
    exe: string,
    get: (paths: string[]) => Promise<Map<string, unknown>>,
    keep: string[],
  ): Promise<string[]> {
    const modsPre = `persistent.mods.${GAME}.`;
    const all = await get([`persistent.mods.${GAME}`]);
    const entries = new Map<string, VortexEntry & { path: string }>();
    const field =
      /^(.+)\.(archiveId|installationPath|attributes\.variant|attributes\.installTime)$/;
    for (const [k, v] of all) {
      if (!k.startsWith(modsPre)) continue;
      const m = field.exec(k.slice(modsPre.length));
      if (!m?.[1]) continue;
      const e = entries.get(m[1]) ?? {
        id: m[1],
        archiveId: '',
        variant: '',
        enabled: false,
        installedAt: 0,
        path: '',
      };
      if (m[2] === 'archiveId' && typeof v === 'string') e.archiveId = v;
      if (m[2] === 'installationPath' && typeof v === 'string') e.path = v;
      if (m[2] === 'attributes.variant' && typeof v === 'string') e.variant = v;
      if (m[2] === 'attributes.installTime')
        e.installedAt = typeof v === 'number' ? v : Date.parse(String(v)) || 0;
      entries.set(m[1], e);
    }
    if (!entries.size) return [];
    const profiles = await get(['persistent.profiles']);
    const inProfiles = new Map<string, string[]>();
    const st = /^persistent\.profiles\.([^.]+)\.modState\.(.+)\.enabled$/;
    for (const [k, v] of profiles) {
      const m = st.exec(k);
      if (!m?.[1] || !m[2]) continue;
      inProfiles.set(m[2], [...(inProfiles.get(m[2]) ?? []), m[1]]);
      const e = entries.get(m[2]);
      if (e && v === true) e.enabled = true;
    }
    const keepSet = new Set(keep);
    const staging = this.mods.vortexDir();
    if (!staging) return [];
    const aside = join(staging, '..', OLD_COPIES);
    const ids = sameDownloadCopies([...entries.values()])
      .filter((id) => !keepSet.has(id))
      .slice(0, 100);
    const moved: Array<{ id: string; from: string; to: string }> = [];
    for (const id of ids) {
      const e = entries.get(id);
      if (!e?.path || /[\\/]|\.\./.test(e.path)) continue;
      const from = join(staging, e.path);
      const to = join(aside, e.path);
      try {
        if (existsSync(from)) {
          if (existsSync(to)) continue;
          mkdirSync(aside, { recursive: true });
          renameSync(from, to);
        }
        moved.push({ id, from, to });
      } catch {
        /* left alone */
      }
    }
    if (!moved.length) return [];
    const dels = moved.flatMap(({ id }) => [
      `${modsPre}${escPath(id)}`,
      ...(inProfiles.get(id) ?? []).map(
        (pid) => `persistent.profiles.${escPath(pid)}.modState.${escPath(id)}`,
      ),
    ]);
    for (let i = 0; i < dels.length; i += 30)
      await run(
        exe,
        dels.slice(i, i + 30).flatMap((d) => ['--del', d]),
      );
    // Read back: an entry still there keeps its folder.
    const back = await get(moved.map(({ id }) => `${modsPre}${escPath(id)}`));
    const left = new Set<string>();
    for (const k of back.keys())
      for (const { id } of moved) if (k.startsWith(`${modsPre}${id}.`)) left.add(id);
    const done: string[] = [];
    for (const m of moved) {
      if (left.has(m.id)) {
        try {
          if (existsSync(m.to) && !existsSync(m.from)) renameSync(m.to, m.from);
        } catch {
          /* stays aside */
        }
      } else done.push(m.id);
    }
    return done;
  }

  /** Vortex just opened after Alton changed it: press its "Deploy Mods" button once (Vortex
   *  only deploys by itself after changes made inside it). */
  async deployWhenOpen(): Promise<boolean> {
    if (!this.state().needsDeploy || this.deploying) return false;
    // Only ever deploy the profile Alton changed: Vortex sometimes comes back on another game or
    // a new empty "Default" profile, and deploying that takes every mod out of the game.
    if (!(await this.onRightProfile())) return false;
    // Pressing Deploy moves the mouse: not while Agent Mode (or anything else) is using it.
    const lock = jobLocks.take(['vortex', 'input'], 'Pressing Deploy in Vortex', 6 * 60_000);
    if ('waitingFor' in lock) return false;
    // The deploy applies Alton's own changes: not "unexpected".
    this.mods.expectChange(10 * 60_000);
    this.deploying = true;
    // Vortex 2 has no "Deploy Mods" button: deploying is "Manual apply (Deploy)" in the Mods
    // page's "More actions" menu (opened with a real click; it has no Invoke pattern).
    const ps = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type @'
using System; using System.Runtime.InteropServices;
public class AltonMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  public struct POINT { public int X; public int Y; }
}
'@
$A = [System.Windows.Automation.AutomationElement]
$T = [System.Windows.Automation.TreeScope]::Descendants
function Find-Named($root, $name, $type) {
  $c = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $name)),
    (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $type)))
  $root.FindFirst($T, $c)
}
function Find-Apply($root) {
  $items = $root.FindAll($T, (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuItem)))
  $items | Where-Object { $_.Current.Name -like 'Manual apply (Deploy)*' } | Select-Object -First 1
}
function Invoke-El($el) {
  try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true } catch { return $false }
}
function Click-El($h, $el, $dx) {
  $r = $el.Current.BoundingRectangle
  $pt = New-Object AltonMouse+POINT; [void][AltonMouse]::GetCursorPos([ref]$pt)
  [void][AltonMouse]::SetForegroundWindow($h)
  $x = if ($dx -gt 0) { $r.X + $dx } else { $r.X + $r.Width / 2 }
  [void][AltonMouse]::SetCursorPos([int]$x, [int]($r.Y + $r.Height / 2))
  [AltonMouse]::mouse_event(2, 0, 0, 0, 0); [AltonMouse]::mouse_event(4, 0, 0, 0, 0)
  Start-Sleep -Milliseconds 120
  [void][AltonMouse]::SetCursorPos($pt.X, $pt.Y)
}
$Btn = [System.Windows.Automation.ControlType]::Button
$stop = (Get-Date).AddMinutes(4)
Start-Sleep -Seconds 6
while ((Get-Date) -lt $stop) {
  foreach ($p in Get-Process Vortex -ErrorAction SilentlyContinue) {
    if ($p.MainWindowHandle -eq 0) { continue }
    try {
      $root = $A::FromHandle($p.MainWindowHandle)
      $old = Find-Named $root 'Deploy Mods' $Btn
      if ($old -and $old.Current.IsEnabled -and (Invoke-El $old)) { 'clicked'; exit 0 }
      $item = Find-Apply $root
      if (-not $item) {
        $mods = Find-Named $root 'Mods' $Btn
        if ($mods) { [void](Invoke-El $mods); Start-Sleep -Seconds 2 }
        $more = Find-Named $root 'More actions' $Btn
        if ($more) { Click-El $p.MainWindowHandle $more 0; Start-Sleep -Seconds 1; $item = Find-Apply $root }
      }
      if ($item) {
        if (-not (Invoke-El $item)) { Click-El $p.MainWindowHandle $item 40 }
        'clicked'; exit 0
      }
    } catch {}
  }
  Start-Sleep -Seconds 3
}
'not found'`;
    try {
      const { out } = await run(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-EncodedCommand',
          Buffer.from(ps, 'utf16le').toString('base64'),
        ],
        5 * 60_000,
      );
      const ok = /clicked/.test(out);
      if (ok) this.save({ ...this.state(), needsDeploy: false });
      return ok;
    } finally {
      lock.release();
      this.deploying = false;
    }
  }
  private deploying = false;

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
