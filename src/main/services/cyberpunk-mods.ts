/** Cyberpunk 2077 mods: reads what Vortex has installed, asks Nexus Mods (with the user's own
 *  API key, stored encrypted) which have newer versions, and hands updates to Vortex to download
 *  and install (Premium: straight away via an nxm:// link; free accounts: the mod's Files page,
 *  where "Mod manager download" sends it to Vortex). Alton never runs or unpacks mod files
 *  itself. Pure parts in src/shared/cpmods.ts. */
import { execFile, spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage, shell } from 'electron';
import {
  findUpdates,
  isVortexInternal,
  needsCheck,
  nexusPage,
  parseModFolder,
  searchMods,
  settleJobs,
  type UpdateJob,
  type CpMod,
  type ModUpdate,
  type NexusInfo,
} from '@shared/cpmods';
import type { LaunchCheck, LoadOrderReport, ModsStatus } from '@shared/ipc';
import { diagnoseLaunch, redmodReport, type PluginFile } from '@shared/cplaunch';
import {
  describeFix,
  ignoredPlugins,
  planFixes,
  setIgnored,
  type FixAction,
  type FixRecord,
} from '@shared/cpfix';
import {
  archiveHashes,
  archiveHeader,
  effectiveOrder,
  findConflicts,
  isOurModlist,
  modlistText,
  preferOrder,
  suggestOrder,
  variants,
} from '@shared/loadorder';
import { SecretStore } from './secret-store';

const API = 'https://api.nexusmods.com/v1';
const GAME = 'cyberpunk2077';

const run = (file: string, args: string[]): Promise<string> =>
  new Promise((resolve) =>
    execFile(file, args, { windowsHide: true, timeout: 10_000 }, (_e, out) =>
      resolve(String(out ?? '')),
    ),
  );
const count = (dir: string): number => {
  try {
    return readdirSync(dir).length;
  } catch {
    return 0;
  }
};

export class CyberpunkMods {
  private key = new SecretStore(join(app.getPath('userData'), 'nexus-key.bin'), safeStorage);
  private cacheFile = join(app.getPath('userData'), 'cpmods-cache.json');
  private cache = new Map<number, NexusInfo>();
  private lastCheck = 0;
  private account: ModsStatus['account'] = null;
  private checking: ModsStatus['checking'] = null;
  private dailyLeft = -1;
  private error = '';
  private gameDir: string | null | undefined;
  private updatesNow: ModUpdate[] = [];
  /** Updates sent or opened, newest last (kept for an hour after they finish). */
  private jobs: UpdateJob[] = [];
  private run: { total: number; done: number; current: string; cancel: boolean } | null = null;

  constructor() {
    try {
      const j = JSON.parse(readFileSync(this.cacheFile, 'utf8')) as {
        lastCheck?: number;
        info?: NexusInfo[];
        account?: ModsStatus['account'];
      };
      for (const i of j.info ?? []) this.cache.set(i.modId, i);
      this.lastCheck = j.lastCheck ?? 0;
      this.account = j.account ?? null;
    } catch {
      /* first run */
    }
  }

  private saveCache(): void {
    try {
      writeFileSync(
        this.cacheFile,
        JSON.stringify({
          lastCheck: this.lastCheck,
          account: this.account,
          info: [...this.cache.values()],
        }),
      );
    } catch {
      /* not fatal */
    }
  }

  /* ── Where things are ── */
  vortexDir(): string | null {
    const d = join(process.env.APPDATA ?? '', 'Vortex', GAME, 'mods');
    return existsSync(d) ? d : null;
  }

  async findGame(): Promise<string | null> {
    if (this.gameDir !== undefined) return this.gameDir;
    const tries: string[] = [];
    // GOG (Galaxy writes the install path to the registry), then Steam libraries, then Epic.
    const gog = await run('reg', [
      'query',
      'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1423049311',
      '/v',
      'path',
    ]);
    const g = /path\s+REG_SZ\s+(.+?)\s*$/im.exec(gog)?.[1];
    if (g) tries.push(g);
    const steamRoots = ['C:\\Program Files (x86)\\Steam'];
    try {
      const vdf = readFileSync(
        join(steamRoots[0] as string, 'steamapps', 'libraryfolders.vdf'),
        'utf8',
      );
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g))
        if (m[1]) steamRoots.push(m[1].replace(/\\\\/g, '\\'));
    } catch {
      /* no Steam */
    }
    for (const r of steamRoots) tries.push(join(r, 'steamapps', 'common', 'Cyberpunk 2077'));
    tries.push(
      'C:\\Program Files (x86)\\GOG Galaxy\\Games\\Cyberpunk 2077',
      'C:\\GOG Games\\Cyberpunk 2077',
      'C:\\Program Files\\Epic Games\\Cyberpunk2077',
    );
    this.gameDir =
      tries.find((t) => existsSync(join(t, 'bin', 'x64', 'Cyberpunk2077.exe'))) ?? null;
    return this.gameDir;
  }

  /** The mods Vortex has installed (one per folder in its staging folder). */
  list(): CpMod[] {
    const v = this.vortexDir();
    if (!v) return [];
    try {
      return readdirSync(v)
        .filter((f) => !isVortexInternal(f))
        .filter((f) => {
          try {
            return statSync(join(v, f)).isDirectory();
          } catch {
            return false;
          }
        })
        .map(parseModFolder)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  async status(): Promise<ModsStatus> {
    const game = await this.findGame();
    this.settle();
    const state = new Map(this.jobs.map((j) => [j.modId, j]));
    const at = (p: string): number => (game ? count(join(game, p)) : 0);
    return {
      game,
      vortex: this.vortexDir(),
      mods: this.list().length,
      files: {
        archives: at('archive\\pc\\mod'),
        cet: at('bin\\x64\\plugins\\cyber_engine_tweaks\\mods'),
        redscript: at('r6\\scripts'),
        tweaks: at('r6\\tweaks'),
        red4ext: at('red4ext\\plugins'),
      },
      keySet: this.key.has(),
      account: this.account,
      checking: this.checking,
      lastCheck: this.lastCheck,
      updates: this.updates().map((u) => ({
        modId: u.latest.modId,
        name: u.mod.name,
        installed: u.mod.version,
        latest: u.latest.version,
        updatedAt: u.latest.updatedAt,
        state: state.get(u.latest.modId)?.state ?? null,
        error: state.get(u.latest.modId)?.error ?? '',
      })),
      updating: this.run
        ? { total: this.run.total, done: this.run.done, current: this.run.current }
        : null,
      jobs: [...this.jobs]
        .reverse()
        .slice(0, 300)
        .map((j) => ({
          modId: j.modId,
          name: j.name,
          state: j.state,
          at: j.at,
          error: j.error ?? '',
        })),
      dailyLeft: this.dailyLeft,
      error: this.error,
    };
  }

  updates(): ModUpdate[] {
    this.updatesNow = findUpdates(this.list(), this.cache);
    return this.updatesNow;
  }

  /* ── Nexus Mods ── */
  private async nexus(path: string, key?: string): Promise<{ status: number; json: unknown }> {
    const k = key ?? (await this.key.get());
    if (!k) throw new Error('Add your Nexus Mods API key first.');
    const r = await fetch(`${API}${path}`, {
      headers: {
        apikey: k,
        accept: 'application/json',
        'Application-Name': 'Alton',
        'Application-Version': app.getVersion(),
      },
      signal: AbortSignal.timeout(20_000),
    });
    const left = Number(r.headers.get('x-rl-daily-remaining'));
    if (Number.isFinite(left)) this.dailyLeft = left;
    return { status: r.status, json: await r.json().catch(() => null) };
  }

  async setKey(raw: string): Promise<{ ok: boolean; message: string }> {
    const k = raw.trim();
    if (!/^[\w+/=-]{20,400}$/.test(k))
      return { ok: false, message: 'That doesn’t look like a Nexus Mods API key.' };
    try {
      const r = await this.nexus('/users/validate.json', k);
      if (r.status === 401 || r.status === 403)
        return { ok: false, message: 'Nexus Mods refused that key.' };
      if (r.status !== 200) return { ok: false, message: `Nexus Mods said ${r.status}.` };
      const j = (r.json ?? {}) as { name?: string; is_premium?: boolean };
      this.account = { name: String(j.name ?? ''), premium: j.is_premium === true };
    } catch {
      return { ok: false, message: 'Couldn’t reach Nexus Mods. Check the internet.' };
    }
    await this.key.set(k);
    this.saveCache();
    return {
      ok: true,
      message: this.account?.premium
        ? `Connected as ${this.account.name} (Premium): updates go straight to Vortex.`
        : `Connected as ${this.account?.name ?? 'you'}. Updates open the mod’s Files page: press “Mod manager download” and Vortex does the rest.`,
    };
  }

  clearKey(): void {
    this.key.clear();
    this.account = null;
    this.saveCache();
  }

  /** Ask Nexus about the mods that need it (all of them the first time: about a minute). */
  async check(): Promise<ModsStatus> {
    if (this.checking) return this.status();
    this.error = '';
    try {
      const ids = this.list()
        .map((m) => m.modId)
        .filter((x): x is number => x !== null);
      // What changed on Nexus this month, so mods checked recently aren't asked again.
      const changed = new Map<number, number>();
      const u = await this.nexus(`/games/${GAME}/mods/updated.json?period=1m`);
      if (u.status === 401) throw new Error('Nexus Mods refused your API key: add it again.');
      if (Array.isArray(u.json))
        for (const x of u.json as Array<{ mod_id?: number; latest_file_update?: number }>)
          if (typeof x.mod_id === 'number' && typeof x.latest_file_update === 'number')
            changed.set(x.mod_id, x.latest_file_update * 1000);
      const todo = needsCheck(ids, this.cache, changed, Date.now());
      this.checking = { done: 0, total: todo.length };
      const queue = [...todo];
      const worker = async (): Promise<void> => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          if (this.dailyLeft >= 0 && this.dailyLeft < 30) {
            this.error =
              'Nexus Mods’ daily limit is nearly used up: the rest will be checked tomorrow.';
            queue.length = 0;
            return;
          }
          try {
            const r = await this.nexus(`/games/${GAME}/mods/${id}.json`);
            const j = (r.json ?? {}) as {
              name?: string;
              version?: string;
              updated_timestamp?: number;
              available?: boolean;
              status?: string;
            };
            this.cache.set(id, {
              modId: id,
              name: String(j.name ?? ''),
              version: String(j.version ?? ''),
              updatedAt: (j.updated_timestamp ?? 0) * 1000,
              fileId: this.cache.get(id)?.fileId ?? null,
              available:
                r.status === 200 &&
                j.available !== false &&
                (j.status ?? 'published') === 'published',
              checkedAt: Date.now(),
            });
          } catch {
            /* skip this one; it's asked again next time */
          }
          if (this.checking) this.checking.done++;
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      this.lastCheck = Date.now();
      this.saveCache();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'The check failed.';
    } finally {
      this.checking = null;
    }
    return this.status();
  }

  /** Jobs waiting on Vortex are marked installed once its new folder appears; finished ones
   *  are dropped after an hour. */
  private settle(): void {
    if (!this.jobs.length) return;
    const now = Date.now();
    this.jobs = settleJobs(this.jobs, this.list(), now).filter(
      (j) => !(j.state === 'installed' || j.state === 'failed') || now - j.at < 3_600_000,
    );
  }

  private job(modId: number, state: UpdateJob['state'], error?: string): UpdateJob {
    let j = this.jobs.find((x) => x.modId === modId);
    if (!j) {
      const mods = this.list().filter((m) => m.modId === modId);
      j = {
        modId,
        name: mods[0]?.name ?? `mod ${modId}`,
        state,
        at: Date.now(),
        before: mods.map((m) => m.folder),
      };
      this.jobs.push(j);
    }
    j.state = state;
    j.at = Date.now();
    if (error) j.error = error;
    else delete j.error;
    return j;
  }

  /** Send one mod's update to Vortex (Premium) or open its Files page (free). */
  async update(modId: number): Promise<{ ok: boolean; message: string }> {
    const j = this.job(modId, 'sending');
    const name = j.name;
    // A fresh "before" snapshot, so an earlier install doesn't count as this one.
    j.before = this.list()
      .filter((m) => m.modId === modId)
      .map((m) => m.folder);
    if (!this.account?.premium) {
      await shell.openExternal(nexusPage(modId, true));
      this.job(modId, 'opened');
      return {
        ok: true,
        message: `Opened ${name} on Nexus: press “Mod manager download” on the newest main file and Vortex installs it.`,
      };
    }
    try {
      const r = await this.nexus(`/games/${GAME}/mods/${modId}/files.json`);
      if (r.status === 401) throw new Error('Nexus Mods refused your API key.');
      if (r.status === 429) throw new Error('Nexus Mods’ rate limit: try again later.');
      const files = ((r.json as { files?: unknown[] } | null)?.files ?? []) as Array<{
        file_id?: number;
        category_name?: string | null;
        is_primary?: boolean;
        uploaded_timestamp?: number;
      }>;
      const main = files
        .filter(
          (f) => typeof f.file_id === 'number' && (f.category_name === 'MAIN' || f.is_primary),
        )
        .sort((a, b) => (b.uploaded_timestamp ?? 0) - (a.uploaded_timestamp ?? 0))[0];
      if (!main?.file_id) {
        await shell.openExternal(nexusPage(modId, true));
        this.job(modId, 'opened');
        return {
          ok: true,
          message: `${name} has no single main file, so I opened its Files page.`,
        };
      }
      await shell.openExternal(`nxm://${GAME}/mods/${modId}/files/${main.file_id}`);
      const c = this.cache.get(modId);
      if (c) this.cache.set(modId, { ...c, fileId: main.file_id });
      this.job(modId, 'in-vortex');
      return { ok: true, message: `Sent ${name} to Vortex to download and install.` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Couldn’t start the update.';
      this.job(modId, 'failed', msg);
      return { ok: false, message: msg };
    }
  }

  /** Every update, in the background (Premium: all of them, a couple of seconds apart so
   *  Vortex keeps up; free: the next 10 Files pages). Progress shows in status(). */
  updateAll(): { ok: boolean; message: string } {
    if (this.run) return { ok: true, message: 'Already updating.' };
    this.settle();
    const busy = new Set(this.jobs.filter((j) => j.state !== 'failed').map((j) => j.modId));
    const todo = this.updates()
      .map((u) => u.latest.modId)
      .filter((id) => !busy.has(id));
    if (!todo.length)
      return {
        ok: true,
        message: this.updatesNow.length
          ? 'They’re all on their way already.'
          : 'Everything is up to date.',
      };
    const premium = this.account?.premium === true;
    const list = premium ? todo : todo.slice(0, 10);
    for (const id of list) this.job(id, 'queued');
    const run = { total: list.length, done: 0, current: '', cancel: false };
    this.run = run;
    void (async () => {
      for (const id of list) {
        if (run.cancel) break;
        if (premium && this.dailyLeft >= 0 && this.dailyLeft < 20) {
          this.error = 'Nexus Mods’ daily limit is nearly used up: the rest can go tomorrow.';
          break;
        }
        run.current = this.jobs.find((j) => j.modId === id)?.name ?? '';
        await this.update(id);
        run.done++;
        await new Promise((res) => setTimeout(res, premium ? 2500 : 1500));
      }
      // Anything not reached goes back to plain "update available".
      this.jobs = this.jobs.filter((j) => j.state !== 'queued');
      if (this.run === run) this.run = null;
    })();
    return {
      ok: true,
      message: premium
        ? `Sending ${list.length} update${list.length === 1 ? '' : 's'} to Vortex…`
        : `Opening ${list.length} of ${todo.length} on Nexus (free accounts download each one from its page). Press Update all again for the next ones.`,
    };
  }

  cancelUpdates(): void {
    if (this.run) this.run.cancel = true;
  }

  /** Open a mod's folder, its Nexus page, the game folder or the Vortex mods folder. */
  async open(what: 'folder' | 'page' | 'game' | 'vortex', modId?: number): Promise<string> {
    if (what === 'page' && modId) {
      await shell.openExternal(nexusPage(modId));
      return 'Opened its Nexus page.';
    }
    if (what === 'game') {
      const g = await this.findGame();
      if (!g) return 'I couldn’t find Cyberpunk 2077.';
      await shell.openPath(g);
      return 'Opened the game folder.';
    }
    const v = this.vortexDir();
    if (!v) return 'I couldn’t find Vortex’s Cyberpunk mods folder.';
    const folder =
      what === 'folder' && modId ? this.list().find((m) => m.modId === modId)?.folder : undefined;
    await shell.openPath(folder ? join(v, folder) : v);
    return folder ? 'Opened the mod’s folder.' : 'Opened Vortex’s mods folder.';
  }

  /** Why won't the game start? Reads RED4ext's launch logs, the plugins' dates and the
   *  redscript log (read only), and names the Vortex mod behind the plugin it stops on. */
  async diagnose(): Promise<LaunchCheck> {
    const game = await this.findGame();
    if (!game)
      return {
        ...diagnoseLaunch([], []),
        verdict: 'I couldn’t find Cyberpunk 2077.',
        vortexMod: null,
        redmod: null,
      };
    const logsDir = join(game, 'red4ext', 'logs');
    const read = (p: string): string => {
      try {
        return readFileSync(p, 'utf8').slice(-200_000);
      } catch {
        return '';
      }
    };
    let names: string[] = [];
    try {
      names = readdirSync(logsDir)
        .filter((n) => /^red4ext-\d{4}-.*\.log$/.test(n))
        .sort()
        .slice(-60);
    } catch {
      /* no logs */
    }
    const logs = names.map((name) => ({ name, text: read(join(logsDir, name)) }));
    const pluginsDir = join(game, 'red4ext', 'plugins');
    const plugins: PluginFile[] = [];
    try {
      for (const p of readdirSync(pluginsDir)) {
        const dir = join(pluginsDir, p);
        try {
          if (!statSync(dir).isDirectory()) continue;
          const dlls = readdirSync(dir)
            .filter((f) => f.toLowerCase().endsWith('.dll'))
            .map((f) => statSync(join(dir, f)).mtimeMs);
          if (dlls.length) plugins.push({ plugin: p, modified: Math.max(...dlls) });
        } catch {
          /* skip */
        }
      }
    } catch {
      /* no plugins */
    }
    const report = diagnoseLaunch(
      logs,
      plugins,
      read(join(game, 'r6', 'logs', 'redscript_rCURRENT.log')),
    );
    // Which Vortex mod installed that plugin?
    let vortexMod: LaunchCheck['vortexMod'] = null;
    const v = this.vortexDir();
    if (v && report.culprit) {
      const folder = this.list().find((m) =>
        existsSync(join(v, m.folder, 'red4ext', 'plugins', report.culprit?.plugin ?? '')),
      );
      if (folder) vortexMod = { name: folder.name, modId: folder.modId, version: folder.version };
    }
    const redmod = redmodReport(read(join(game, 'tools', 'redmod', 'bin', 'REDmodLog.txt')));
    const verdict = [report.verdict, redmod?.failed ? redmod.verdict : '']
      .filter(Boolean)
      .join(' ');
    return { ...report, verdict, vortexMod, redmod };
  }

  /* ── Archive load order (archive\pc\mod; first loaded wins) ── */
  private async archiveDir(): Promise<string | null> {
    const g = await this.findGame();
    return g ? join(g, 'archive', 'pc', 'mod') : null;
  }

  /** Which Vortex mod installed each archive file. */
  private archiveOwners(): Map<string, string> {
    const map = new Map<string, string>();
    const v = this.vortexDir();
    if (!v) return map;
    for (const m of this.list()) {
      try {
        for (const f of readdirSync(join(v, m.folder, 'archive', 'pc', 'mod')))
          if (f.toLowerCase().endsWith('.archive')) map.set(f, m.name);
      } catch {
        /* no archives in this mod */
      }
    }
    return map;
  }

  private readOrder(dir: string): { names: string[]; order: string[]; modlist: string | null } {
    const names = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.archive'));
    let modlist: string | null = null;
    try {
      modlist = readFileSync(join(dir, 'modlist.txt'), 'utf8');
    } catch {
      /* none: name order */
    }
    return { names, order: effectiveOrder(names, modlist), modlist };
  }

  async loadOrder(): Promise<LoadOrderReport> {
    const dir = await this.archiveDir();
    const game = await this.findGame();
    const redmod = game
      ? redmodReport(
          (() => {
            try {
              return readFileSync(join(game, 'tools', 'redmod', 'bin', 'REDmodLog.txt'), 'utf8');
            } catch {
              return '';
            }
          })(),
        )
      : null;
    if (!dir || !existsSync(dir))
      return {
        archives: 0,
        modlist: 'none',
        conflicts: [],
        moves: [],
        redmod,
        error: 'I couldn’t find the game’s archive\\pc\\mod folder.',
      };
    const { names, order, modlist } = this.readOrder(dir);
    const hashes = new Map<string, string[]>();
    for (const n of names) {
      let fd = -1;
      try {
        fd = openSync(join(dir, n), 'r');
        const head = Buffer.alloc(40);
        readSync(fd, head, 0, 40, 0);
        const h = archiveHeader(head);
        if (!h) continue;
        const idx = Buffer.alloc(h.indexSize);
        readSync(fd, idx, 0, h.indexSize, h.indexPos);
        hashes.set(n, archiveHashes(idx));
      } catch {
        /* unreadable: skip */
      } finally {
        if (fd >= 0) closeSync(fd);
      }
    }
    const conflicts = findConflicts(order, hashes);
    const { moves } = suggestOrder(order, conflicts);
    const owners = this.archiveOwners();
    return {
      archives: names.length,
      modlist: modlist === null ? 'none' : isOurModlist(modlist) ? 'alton' : 'other',
      conflicts: conflicts.slice(0, 150).map((c) => ({
        ...c,
        variants: variants(c.winner, c.loser),
        winnerMod: owners.get(c.winner) ?? '',
        loserMod: owners.get(c.loser) ?? '',
      })),
      moves,
      redmod,
      error: '',
    };
  }

  /** Write archive\pc\mod\modlist.txt: the suggested order, or with one archive made to win. */
  async setOrder(
    change: { kind: 'suggested' } | { kind: 'prefer'; archive: string; over: string },
  ): Promise<{ ok: boolean; message: string }> {
    const dir = await this.archiveDir();
    if (!dir || !existsSync(dir))
      return { ok: false, message: 'I couldn’t find the game’s mod folder.' };
    const { order, modlist } = this.readOrder(dir);
    let next: string[];
    if (change.kind === 'prefer') {
      if (!order.includes(change.archive) || !order.includes(change.over))
        return { ok: false, message: 'Those archives aren’t installed any more.' };
      next = preferOrder(order, change.archive, change.over);
    } else {
      const r = await this.loadOrder();
      next = suggestOrder(order, r.conflicts).order;
      if (!r.moves.length)
        return { ok: true, message: 'Nothing to change: the order is already right.' };
    }
    try {
      // Keep someone else's modlist.txt (another tool's) as a backup the first time.
      const file = join(dir, 'modlist.txt');
      if (modlist !== null && !isOurModlist(modlist) && !existsSync(`${file}.before-alton`))
        renameSync(file, `${file}.before-alton`);
      writeFileSync(file, modlistText(next));
    } catch (e) {
      return {
        ok: false,
        message: `Windows wouldn’t let me write the load order (${e instanceof Error ? e.message : 'no access'}).`,
      };
    }
    return {
      ok: true,
      message:
        change.kind === 'prefer'
          ? `Done: “${change.archive}” now loads before “${change.over}”, so its version wins. It takes effect next time the game starts.`
          : 'Done: the suggested order is saved. It takes effect next time the game starts.',
    };
  }

  /** Back to the game's name order (removes Alton's modlist.txt; restores one it replaced). */
  async resetOrder(): Promise<{ ok: boolean; message: string }> {
    const dir = await this.archiveDir();
    if (!dir) return { ok: false, message: 'I couldn’t find the game’s mod folder.' };
    const file = join(dir, 'modlist.txt');
    try {
      const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
      if (text && !isOurModlist(text))
        return {
          ok: false,
          message: 'That load order wasn’t written by Alton, so I left it alone.',
        };
      rmSync(file, { force: true });
      if (existsSync(`${file}.before-alton`)) renameSync(`${file}.before-alton`, file);
      return { ok: true, message: 'Back to the previous load order.' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t undo it.' };
    }
  }

  /* ── Fixing launch problems by itself ── */
  private fixFile = join(app.getPath('userData'), 'cpfix.json');
  private fixState: { auto: boolean; fixes: FixRecord[]; seen: string } = (() => {
    try {
      const j = JSON.parse(readFileSync(join(app.getPath('userData'), 'cpfix.json'), 'utf8')) as {
        auto?: boolean;
        fixes?: FixRecord[];
        seen?: string;
      };
      return { auto: j.auto !== false, fixes: j.fixes ?? [], seen: j.seen ?? '' };
    } catch {
      return { auto: true, fixes: [], seen: '' };
    }
  })();
  private fixing = false;

  private saveFixes(): void {
    try {
      writeFileSync(this.fixFile, JSON.stringify(this.fixState));
    } catch {
      /* not fatal */
    }
  }

  fixes(): { auto: boolean; fixing: boolean; fixes: FixRecord[] } {
    return {
      auto: this.fixState.auto,
      fixing: this.fixing,
      fixes: [...this.fixState.fixes].reverse().slice(0, 30),
    };
  }

  setAutoFix(on: boolean): void {
    this.fixState.auto = on;
    this.saveFixes();
  }

  private async gameRunning(): Promise<boolean> {
    const out = await run('tasklist', ['/FI', 'IMAGENAME eq Cyberpunk2077.exe', '/NH']);
    return /Cyberpunk2077\.exe/i.test(out);
  }

  private iniPath(game: string): string {
    return join(game, 'red4ext', 'config.ini');
  }

  /** Run REDmod's own deploy with this list of mods (what Vortex does). */
  private redmodDeploy(game: string, mods: string[]): Promise<boolean> {
    const list = join(game, 'V2077', 'alton-modlist.txt');
    writeFileSync(list, `${mods.join('\n')}\n`);
    const exe = join(game, 'tools', 'redmod', 'bin', 'redMod.exe');
    return new Promise((resolve) => {
      const p = spawn(
        exe,
        [
          'deploy',
          '-reportProgress',
          '-root',
          game,
          `-rttiSchemaPath=${join(game, 'tools', 'redmod', 'metadata.json')}`,
          `-modlist=${list}`,
        ],
        { windowsHide: true, cwd: join(game, 'tools', 'redmod', 'bin') },
      );
      const t = setTimeout(() => p.kill(), 10 * 60_000);
      p.on('error', () => resolve(false));
      p.on('exit', () => {
        clearTimeout(t);
        let log = '';
        try {
          log = readFileSync(join(game, 'tools', 'redmod', 'bin', 'REDmodLog.txt'), 'utf8');
        } catch {
          /* no log */
        }
        resolve(redmodReport(log)?.failed === false);
      });
    });
  }

  /** Look at the last launch and fix what can be fixed. Returns what was done. */
  async autofix(): Promise<{ done: FixRecord[]; message: string }> {
    if (this.fixing) return { done: [], message: 'Already fixing.' };
    const game = await this.findGame();
    if (!game) return { done: [], message: 'I couldn’t find Cyberpunk 2077.' };
    if (await this.gameRunning())
      return { done: [], message: 'Cyberpunk is running: close it first, then I can fix it.' };
    this.fixing = true;
    const done: FixRecord[] = [];
    try {
      const d = await this.diagnose();
      let ini = '';
      try {
        ini = readFileSync(this.iniPath(game), 'utf8');
      } catch {
        /* no config yet */
      }
      const modId = d.vortexMod?.modId ?? null;
      const upd = modId !== null ? this.updates().find((u) => u.latest.modId === modId) : undefined;
      const skipped = this.fixState.fixes
        .filter((f) => !f.undone && f.action.kind === 'redmod-without')
        .flatMap((f) => (f.action.kind === 'redmod-without' ? f.action.mods : []));
      const plan = planFixes({
        report: d,
        redmod: d.redmod,
        culpritMod: d.vortexMod,
        // Only Premium updates install by themselves; otherwise switch the plugin off for now.
        updateFor:
          upd && this.account?.premium ? { modId: upd.latest.modId, name: upd.mod.name } : null,
        ignored: ignoredPlugins(ini),
        redmodSkipped: skipped,
      });
      for (const action of plan) {
        let ok = true;
        let note = describeFix(action);
        if (action.kind === 'update') {
          const r = await this.update(action.modId);
          ok = r.ok;
          if (!ok) note = r.message;
        } else if (action.kind === 'ignore-plugin') {
          try {
            ini = setIgnored(ini, action.plugin, true);
            // RED4ext may go by the DLL's name rather than the folder's: ignore both.
            const file = d.runs[d.runs.length - 1]?.stoppedFile;
            if (file && file.toLowerCase() !== action.plugin.toLowerCase())
              ini = setIgnored(ini, file, true);
            writeFileSync(this.iniPath(game), ini);
            if (upd) note += ` An update is waiting on Nexus: update it, then undo this.`;
          } catch (e) {
            ok = false;
            note = `Couldn’t change RED4ext’s settings: ${e instanceof Error ? e.message : 'no access'}.`;
          }
        } else {
          const mods = (d.redmod?.mods ?? []).filter((m) => !action.mods.includes(m));
          ok = await this.redmodDeploy(game, mods);
          if (!ok)
            note = `REDmod still failed without ${action.mods.join(', ')}: check the REDmod log.`;
        }
        if (!ok) {
          this.error = note;
          continue;
        }
        const rec: FixRecord = {
          id: `f${Date.now().toString(36)}${done.length}`,
          at: Date.now(),
          action,
          note,
          undone: false,
        };
        this.fixState.fixes.push(rec);
        done.push(rec);
      }
      this.fixState.fixes = this.fixState.fixes.slice(-50);
      this.saveFixes();
      return {
        done,
        message: done.length
          ? `${done.map((f) => f.note).join(' ')} Try starting the game again.`
          : d.culprit || d.redmod?.failed
            ? 'I couldn’t fix this one by myself. The launch check above says what to do.'
            : 'Nothing to fix: the last launch didn’t fail on a mod.',
      };
    } finally {
      this.fixing = false;
    }
  }

  /** Put a fix back (switch the plugin on again, or redeploy REDmod with every mod). */
  async undoFix(id: string): Promise<{ ok: boolean; message: string }> {
    const f = this.fixState.fixes.find((x) => x.id === id);
    const game = await this.findGame();
    if (!f || f.undone || !game) return { ok: false, message: 'Nothing to undo.' };
    const a: FixAction = f.action;
    if (a.kind === 'ignore-plugin') {
      try {
        const ini = readFileSync(this.iniPath(game), 'utf8');
        let next = setIgnored(ini, a.plugin, false);
        // …and the DLL name it may have been ignored under too.
        for (const name of ignoredPlugins(next))
          if (name.toLowerCase().startsWith(a.plugin.toLowerCase()))
            next = setIgnored(next, name, false);
        writeFileSync(this.iniPath(game), next);
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t change it back.' };
      }
    } else if (a.kind === 'redmod-without') {
      let all: string[] = [];
      try {
        all = readFileSync(join(game, 'V2077', 'modlist.txt'), 'utf8')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
      } catch {
        /* none */
      }
      if (!(await this.redmodDeploy(game, all)))
        return {
          ok: false,
          message: 'REDmod failed again with every mod: the fix is still needed.',
        };
    } else return { ok: false, message: 'Updates can’t be undone here: use Vortex.' };
    f.undone = true;
    this.saveFixes();
    return {
      ok: true,
      message:
        a.kind === 'ignore-plugin'
          ? `${a.plugin} is switched back on.`
          : 'REDmod deployed again with every mod.',
    };
  }

  /** Every minute (while the game isn't running): a new failed launch or REDmod deploy gets
   *  fixed by itself when that's switched on, and the user is told. */
  watch(notify: (title: string, body: string) => void): void {
    const check = async (): Promise<void> => {
      if (!this.fixState.auto || this.fixing) return;
      const game = await this.findGame();
      if (!game) return;
      let newest = '';
      try {
        newest =
          readdirSync(join(game, 'red4ext', 'logs'))
            .filter((n) => /^red4ext-\d{4}-.*\.log$/.test(n))
            .sort()
            .pop() ?? '';
      } catch {
        /* no logs */
      }
      let redmodAt = 0;
      try {
        redmodAt = statSync(join(game, 'tools', 'redmod', 'bin', 'REDmodLog.txt')).mtimeMs;
      } catch {
        /* none */
      }
      const key = `${newest}|${Math.round(redmodAt)}`;
      if (key === this.fixState.seen) return;
      if (await this.gameRunning()) return;
      this.fixState.seen = key;
      this.saveFixes();
      const r = await this.autofix();
      if (r.done.length) notify('Cyberpunk: fixed a launch problem', r.message);
    };
    const t = setInterval(() => void check(), 60_000);
    t.unref?.();
    setTimeout(() => void check(), 20_000).unref?.();
  }

  find(q: string): CpMod[] {
    return searchMods(this.list(), q);
  }

  info(modId: number): NexusInfo | undefined {
    return this.cache.get(modId);
  }
}

let one: CyberpunkMods | null = null;
export const cyberpunkMods = (): CyberpunkMods => (one ??= new CyberpunkMods());
