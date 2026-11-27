/** Minecraft mods (Lunar Client profiles and .minecraft, Fabric): reads every mod jar, finds
 *  problems (wrong Minecraft version, missing required mods, the same mod twice, mods that break
 *  each other, crash-report suspects, loader complaints), checks Modrinth for updates by file
 *  hash (no account needed) and fixes things: update, add a missing mod, switch a mod off
 *  (".jar.disabled", which Lunar understands). Downloads only from Modrinth's CDN, checked by
 *  hash; replaced jars are kept in "_alton_backup" so every change can be undone. */
import { createHash } from 'node:crypto';
import { jobLocks } from './job-locks';
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { app } from 'electron';
import {
  findProblems,
  logProblems,
  modrinthProjectFor,
  parseCrashReport,
  parseFabricMod,
  type McMod,
  type McProblem,
} from '@shared/mcmods';
import type { McChange, McProfile, McReport, McUpdate } from '@shared/ipc';
import { zipEntries, zipFile, zipRead } from './zip';

const MODRINTH = 'https://api.modrinth.com/v2';
const BACKUP = '_alton_backup';

const run = (file: string, args: string[]): Promise<string> =>
  new Promise((resolve) =>
    execFile(file, args, { windowsHide: true, timeout: 10_000 }, (_e, out) =>
      resolve(String(out ?? '')),
    ),
  );
const list = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};
const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const read = (p: string): string => {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};
const pretty = (slug: string): string =>
  /^\d+(\.\d+)*$/.test(slug)
    ? `Minecraft ${slug}`
    : slug
        .split(/[-_]/)
        .map((w) =>
          w.length <= 3 && /^[a-z]+$/.test(w) && w !== 'the'
            ? w.toUpperCase()
            : w[0]?.toUpperCase() + w.slice(1),
        )
        .join(' ');

/** What a mod jar says about itself (null if it isn't a Fabric mod). */
function readJar(path: string, file: string, library: boolean): (McMod & { sha1: string }) | null {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  const sha1 = createHash('sha1').update(buf).digest('hex');
  const txt = zipFile(buf, 'fabric.mod.json');
  const m = txt ? parseFabricMod(txt.toString('utf8')) : null;
  if (!m) return null;
  const provides = [...m.provides];
  // Mods bundled inside the jar (and inside those, up to 3 levels) count as installed too.
  const nested = (zip: Buffer, jars: string[], depth: number): void => {
    if (depth > 3 || !jars.length) return;
    const entries = zipEntries(zip);
    for (const j of jars) {
      const e = entries.find((x) => x.name === j);
      const inner = e ? zipRead(zip, e) : null;
      const t = inner ? zipFile(inner, 'fabric.mod.json') : null;
      const im = t ? parseFabricMod(t.toString('utf8')) : null;
      if (!im || !inner) continue;
      provides.push(im.id, ...im.provides);
      nested(inner, im.jars, depth + 1);
    }
  };
  nested(buf, m.jars, 1);
  return {
    file,
    enabled: !/\.disabled$/i.test(file),
    id: m.id,
    name: m.name,
    version: m.version,
    depends: m.depends,
    breaks: m.breaks,
    provides,
    library,
    sha1,
  };
}

interface Found extends McProfile {
  logs: string[];
  crashDirs: string[];
}

export class MinecraftMods {
  private lunar = join(process.env.USERPROFILE ?? '', '.lunarclient');
  private dotMc = join(process.env.APPDATA ?? '', '.minecraft');
  private historyFile = join(app.getPath('userData'), 'mcfix.json');
  private updatesCache = new Map<string, { at: number; byFile: Map<string, McUpdate> }>();

  /** Every profile with a mods folder. */
  profiles(): Found[] {
    const out: Found[] = [];
    const selected = /Profile selected, using (.+?) \(ID:/g;
    let current = '';
    for (const m of read(join(this.lunar, 'logs', 'launcher', 'main.log')).matchAll(selected))
      current = m[1] ?? current;
    for (const slug of list(join(this.lunar, 'profiles'))) {
      const root = join(this.lunar, 'profiles', slug);
      if (!isDir(root)) continue;
      const name = pretty(slug);
      const add = (
        dir: string,
        version: string,
        loader: string,
        extraLogs: string[] = [],
      ): void => {
        const jars = list(dir).filter((f) => /\.jar(\.disabled)?$/i.test(f)).length;
        if (!jars) return;
        out.push({
          id: `lunar:${slug}:${version}`,
          name: version && !name.includes(version) ? `${name} (${version})` : name,
          launcher: 'Lunar Client',
          gameVersion: version,
          loader,
          modsDir: dir,
          mods: jars,
          current: current.toLowerCase() === name.toLowerCase() || current === slug,
          logs: [join(root, 'logs', 'latest.log'), ...extraLogs],
          crashDirs: [join(root, 'crash-reports')],
        });
      };
      // Lunar's own profiles: mods\fabric-26.3 (and its dependencies folder).
      for (const d of list(join(root, 'mods'))) {
        const m = /^(fabric|quilt|forge|neoforge)-(.+)$/i.exec(d);
        if (m && isDir(join(root, 'mods', d)))
          add(join(root, 'mods', d), m[2] ?? '', (m[1] ?? '').toLowerCase());
      }
      // Modpacks: versions\1.21.10-7.30\mods (the game version comes first).
      let viaVersions = false;
      for (const v of list(join(root, 'versions'))) {
        const dir = join(root, 'versions', v, 'mods');
        if (!isDir(dir)) continue;
        viaVersions = true;
        add(dir, /^(\d+(?:\.\d+){1,2})/.exec(v)?.[1] ?? '', 'fabric', [
          join(root, 'versions', v, 'logs', 'latest.log'),
        ]);
      }
      if (
        !viaVersions &&
        !list(join(root, 'mods')).some((d) => /^(fabric|quilt|forge|neoforge)-/i.test(d))
      )
        add(join(root, 'mods'), '', 'fabric');
    }
    const mcMods = join(this.dotMc, 'mods');
    const jars = list(mcMods).filter((f) => /\.jar(\.disabled)?$/i.test(f)).length;
    if (jars)
      out.push({
        id: 'minecraft:default',
        name: 'Minecraft Launcher (.minecraft)',
        launcher: 'Minecraft Launcher',
        gameVersion: '',
        loader: 'fabric',
        modsDir: mcMods,
        mods: jars,
        current: false,
        logs: [join(this.dotMc, 'logs', 'latest.log')],
        crashDirs: [join(this.dotMc, 'crash-reports')],
      });
    return out.sort((a, b) => Number(b.current) - Number(a.current) || b.mods - a.mods);
  }

  private profile(id: string): Found | null {
    return this.profiles().find((p) => p.id === id) ?? null;
  }

  private readMods(p: Found): Array<McMod & { sha1: string }> {
    const mods: Array<McMod & { sha1: string }> = [];
    for (const f of list(p.modsDir).filter((x) => /\.jar(\.disabled)?$/i.test(x))) {
      const m = readJar(join(p.modsDir, f), f, false);
      if (m) mods.push(m);
    }
    for (const lib of ['dependencies']) {
      const dir = join(p.modsDir, lib);
      for (const f of list(dir).filter((x) => /\.jar$/i.test(x))) {
        const m = readJar(join(dir, f), `${lib}/${f}`, true);
        if (m) mods.push(m);
      }
    }
    return mods;
  }

  /** Everything wrong with a profile's mods. */
  async scan(id: string): Promise<McReport> {
    const p = this.profile(id);
    if (!p)
      return {
        profile: null,
        mods: [],
        problems: [],
        log: [],
        crash: null,
        updates: [],
        error: 'That profile isn’t there any more.',
      };
    const mods = this.readMods(p);
    // Game version: from the folder, else what most mods ask for.
    let version = p.gameVersion;
    if (!version) {
      const counts = new Map<string, number>();
      for (const m of mods)
        for (const r of m.depends.minecraft ?? []) {
          const v = /(\d+\.\d+(?:\.\d+)?)/.exec(r)?.[1];
          if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      version = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    }
    let problems: McProblem[] = findProblems(mods, version);
    // A Lunar profile that hasn't been played yet: Lunar downloads the mods it needs (into
    // "dependencies") on the first launch, so "missing" isn't real yet.
    if (p.launcher === 'Lunar Client' && !existsSync(join(p.modsDir, 'dependencies'))) {
      const n = problems.filter((x) => x.kind === 'missing').length;
      problems = problems.filter((x) => x.kind !== 'missing');
      if (n)
        problems.push({
          kind: 'log',
          file: '',
          modId: '',
          text: `This profile hasn’t been played in Lunar yet. Lunar downloads the ${n} required mod${n === 1 ? '' : 's'} it needs (like Fabric API) the first time you play it; check again after that.`,
        });
    }
    // The newest crash report, if it's newer than the newest game log (i.e. the last run crashed).
    let crash: McReport['crash'] = null;
    let logAt = 0;
    let logText = '';
    for (const l of p.logs)
      try {
        const st = statSync(l);
        if (st.mtimeMs > logAt) {
          logAt = st.mtimeMs;
          logText = read(l);
        }
      } catch {
        /* none */
      }
    for (const dir of p.crashDirs) {
      const f = list(dir)
        .filter((x) => /^crash-.*\.txt$/i.test(x))
        .sort()
        .pop();
      if (!f) continue;
      const at = statSync(join(dir, f)).mtimeMs;
      const c = parseCrashReport(read(join(dir, f)));
      if (!crash || at > crash.at)
        crash = { at, file: f, description: c.description, suspects: c.suspects };
    }
    if (crash)
      for (const s of crash.suspects) {
        const m = mods.find((x) => x.id === s && !x.library);
        if (m && m.enabled)
          problems.push({
            kind: 'crash',
            file: m.file,
            modId: m.id,
            text: `The last crash report blames ${m.name}.`,
          });
      }
    for (const t of logProblems(logText))
      problems.push({ kind: 'log', file: '', modId: '', text: t });
    const cached = this.updatesCache.get(p.id);
    return {
      profile: { ...p, gameVersion: version },
      mods: mods.map((m) => ({
        file: m.file,
        enabled: m.enabled,
        id: m.id,
        name: m.name,
        version: m.version,
        depends: m.depends,
        breaks: m.breaks,
        provides: m.provides,
        library: m.library,
      })),
      problems,
      log: logProblems(logText),
      crash,
      updates: cached ? [...cached.byFile.values()] : [],
      error: '',
    };
  }

  /* ── Modrinth ── */
  private async modrinth(path: string, body?: unknown): Promise<unknown> {
    const r = await fetch(`${MODRINTH}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'User-Agent': `Alton-desktop-assistant/${app.getVersion()}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Modrinth said ${r.status}.`);
    return r.json();
  }

  /** Newer versions on Modrinth for this profile's Minecraft version (by each jar's hash). */
  async checkUpdates(id: string): Promise<McReport> {
    const p = this.profile(id);
    if (!p) return this.scan(id);
    const report = await this.scan(id);
    const version = report.profile?.gameVersion ?? '';
    const mods = this.readMods(p).filter((m) => !m.library);
    const byFile = new Map<string, McUpdate>();
    try {
      if (version && mods.length) {
        const res = (await this.modrinth('/version_files/update', {
          hashes: mods.map((m) => m.sha1),
          algorithm: 'sha1',
          loaders: [p.loader || 'fabric'],
          game_versions: [version],
        })) as Record<string, ModrinthVersion> | null;
        for (const m of mods) {
          const v = res?.[m.sha1];
          const f = v?.files.find((x) => x.primary) ?? v?.files[0];
          if (!v || !f || f.hashes.sha1 === m.sha1) continue;
          byFile.set(m.file, {
            file: m.file,
            modId: m.id,
            name: m.name,
            from: m.version,
            to: v.version_number,
            url: f.url,
            filename: f.filename,
            sha1: f.hashes.sha1,
          });
        }
      }
      this.updatesCache.set(p.id, { at: Date.now(), byFile });
    } catch (e) {
      return { ...report, error: e instanceof Error ? e.message : 'Couldn’t reach Modrinth.' };
    }
    return { ...report, updates: [...byFile.values()] };
  }

  /* ── Changes (all undoable) ── */
  history(): McChange[] {
    try {
      return JSON.parse(readFileSync(this.historyFile, 'utf8')) as McChange[];
    } catch {
      return [];
    }
  }
  private record(c: Omit<McChange, 'id' | 'at' | 'undone'>): McChange {
    const all = this.history();
    const rec: McChange = {
      ...c,
      id: `m${Date.now().toString(36)}${all.length}`,
      at: Date.now(),
      undone: false,
    };
    writeFileSync(this.historyFile, JSON.stringify([...all, rec].slice(-200)));
    return rec;
  }

  private async minecraftRunning(): Promise<boolean> {
    const out = await run('tasklist', ['/FI', 'IMAGENAME eq javaw.exe', '/NH']);
    return /javaw\.exe/i.test(out);
  }

  private async download(url: string, sha1: string, dest: string): Promise<void> {
    if (!/^https:\/\/cdn\.modrinth\.com\//i.test(url)) throw new Error('Not a Modrinth download.');
    const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`Download failed (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (createHash('sha1').update(buf).digest('hex') !== sha1)
      throw new Error('The download didn’t match Modrinth’s checksum, so it wasn’t used.');
    writeFileSync(dest, buf);
  }

  /** Switch a mod off/on (".jar.disabled"). */
  async setEnabled(
    id: string,
    file: string,
    on: boolean,
  ): Promise<{ ok: boolean; message: string }> {
    const p = this.profile(id);
    if (!p || /[\\/]/.test(file)) return { ok: false, message: 'Which mod?' };
    if (await this.minecraftRunning()) return { ok: false, message: 'Close Minecraft first.' };
    const base = file.replace(/\.disabled$/i, '');
    const from = join(p.modsDir, on ? `${base}.disabled` : base);
    const to = join(p.modsDir, on ? base : `${base}.disabled`);
    if (!existsSync(from)) return { ok: false, message: 'That mod file isn’t there.' };
    renameSync(from, to);
    // Checked after: the file really has its new name.
    if (!existsSync(to) || existsSync(from))
      return {
        ok: false,
        message: `Couldn’t ${on ? 'switch on' : 'switch off'} ${base}: the file didn’t change.`,
      };
    this.record({
      profile: id,
      kind: on ? 'enable' : 'disable',
      file: base,
      note: `${on ? 'Switched on' : 'Switched off'} ${base}.`,
    });
    return { ok: true, message: `${on ? 'Switched on' : 'Switched off'} ${base}.` };
  }

  /** Update one mod to the Modrinth version found by checkUpdates (old jar kept as a backup). */
  async update(id: string, file: string): Promise<{ ok: boolean; message: string }> {
    const p = this.profile(id);
    const u = this.updatesCache.get(id)?.byFile.get(file);
    if (!p || !u) return { ok: false, message: 'Check for updates first.' };
    if (await this.minecraftRunning()) return { ok: false, message: 'Close Minecraft first.' };
    try {
      const dest = join(p.modsDir, basename(u.filename));
      await this.download(u.url, u.sha1, `${dest}.part`);
      mkdirSync(join(p.modsDir, BACKUP), { recursive: true });
      renameSync(join(p.modsDir, file), join(p.modsDir, BACKUP, file));
      renameSync(`${dest}.part`, dest);
      this.updatesCache.get(id)?.byFile.delete(file);
      this.record({
        profile: id,
        kind: 'update',
        file,
        newFile: basename(u.filename),
        note: `Updated ${u.name} ${u.from} → ${u.to}.`,
      });
      return { ok: true, message: `Updated ${u.name} to ${u.to}.` };
    } catch (e) {
      rmSync(join(p.modsDir, `${basename(u.filename)}.part`), { force: true });
      return { ok: false, message: e instanceof Error ? e.message : 'Update failed.' };
    }
  }

  /** Add a mod that another one needs, from Modrinth (its id is usually the Modrinth slug). */
  async addMissing(id: string, modId: string): Promise<{ ok: boolean; message: string }> {
    const p = this.profile(id);
    if (!p || !/^[\w.-]{2,64}$/.test(modId)) return { ok: false, message: 'Which mod?' };
    if (await this.minecraftRunning()) return { ok: false, message: 'Close Minecraft first.' };
    const version = (await this.scan(id)).profile?.gameVersion ?? '';
    try {
      const q = `?loaders=${encodeURIComponent(JSON.stringify([p.loader || 'fabric']))}${version ? `&game_versions=${encodeURIComponent(JSON.stringify([version]))}` : ''}`;
      // The Modrinth project for a mod id: Fabric API's parts all come from "fabric-api", LibJF's
      // from "libjf"; otherwise the id itself, else Modrinth's search.
      let project = modrinthProjectFor(modId);
      let vs = (await this.modrinth(`/project/${encodeURIComponent(project)}/version${q}`)) as
        ModrinthVersion[] | null;
      if (!vs?.length) {
        const facets = JSON.stringify([
          [`categories:${p.loader || 'fabric'}`],
          ...(version ? [[`versions:${version}`]] : []),
          ['project_type:mod'],
        ]);
        const s = (await this.modrinth(
          `/search?query=${encodeURIComponent(modId.replace(/[-_]/g, ' '))}&facets=${encodeURIComponent(facets)}&limit=5`,
        )) as { hits?: Array<{ slug: string; title: string }> } | null;
        const norm = (x: string): string => x.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hit = s?.hits?.find(
          (h) => norm(h.slug) === norm(modId) || norm(h.title) === norm(modId),
        );
        if (hit) {
          project = hit.slug;
          vs = (await this.modrinth(`/project/${encodeURIComponent(project)}/version${q}`)) as
            ModrinthVersion[] | null;
        }
      }
      const v = vs?.[0];
      const f = v?.files.find((x) => x.primary) ?? v?.files[0];
      if (!v || !f)
        return {
          ok: false,
          message: `Modrinth has no “${modId}” for Minecraft ${version || 'this version'}: get it from the mod’s own page.`,
        };
      const dest = join(p.modsDir, basename(f.filename));
      if (existsSync(dest)) return { ok: true, message: `${f.filename} is already there.` };
      await this.download(f.url, f.hashes.sha1, dest);
      this.record({
        profile: id,
        kind: 'add',
        file: basename(f.filename),
        note: `Added ${modId} ${v.version_number}.`,
      });
      return { ok: true, message: `Added ${modId} (${v.version_number}).` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t add it.' };
    }
  }

  /** Fix what can be fixed safely: duplicates off, missing mods added, wrong-version mods updated
   *  (or switched off when there's no version for this Minecraft). */
  async fixAll(id: string): Promise<{ ok: boolean; message: string; done: string[] }> {
    const lock = jobLocks.take(['minecraft-files'], 'Minecraft mod tools', 30 * 60_000);
    if ('waitingFor' in lock)
      return { ok: false, message: `Waiting: ${lock.waitingFor}.`, done: [] };
    try {
      return await this.fixAllNow(id);
    } finally {
      lock.release();
    }
  }

  private async fixAllNow(id: string): Promise<{ ok: boolean; message: string; done: string[] }> {
    if (await this.minecraftRunning())
      return { ok: false, message: 'Close Minecraft first.', done: [] };
    const r = await this.checkUpdates(id);
    const done: string[] = [];
    const failed: string[] = [];
    const seen = new Set<string>();
    for (const pr of r.problems) {
      const key = `${pr.kind}:${pr.file}:${pr.needs ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let res: { ok: boolean; message: string } | null = null;
      if (pr.kind === 'duplicate') res = await this.setEnabled(id, pr.file, false);
      else if (pr.kind === 'missing' && pr.needs) {
        // One download covers every part of the same mod (e.g. all of Fabric API's).
        const project = modrinthProjectFor(pr.needs);
        if (seen.has(`project:${project}`)) continue;
        seen.add(`project:${project}`);
        res = await this.addMissing(id, pr.needs);
      } else if (pr.kind === 'wrong-version')
        res = r.updates.some((u) => u.file === pr.file)
          ? await this.update(id, pr.file)
          : await this.setEnabled(id, pr.file, false);
      if (res) (res.ok ? done : failed).push(res.message);
    }
    return {
      ok: true,
      done,
      message: done.length
        ? `${done.join(' ')}${failed.length ? ` Couldn’t fix: ${failed.join(' ')}` : ''}`
        : failed.length
          ? `Couldn’t fix: ${failed.join(' ')}`
          : 'Nothing that I can fix by myself: the list shows anything left.',
    };
  }

  /** Update every mod that has a Modrinth update for this Minecraft version. */
  async updateAll(id: string): Promise<{ ok: boolean; message: string }> {
    const lock = jobLocks.take(['minecraft-files'], 'Minecraft mod tools', 30 * 60_000);
    if ('waitingFor' in lock) return { ok: false, message: `Waiting: ${lock.waitingFor}.` };
    try {
      return await this.updateAllNow(id);
    } finally {
      lock.release();
    }
  }

  private async updateAllNow(id: string): Promise<{ ok: boolean; message: string }> {
    const r = await this.checkUpdates(id);
    if (!r.updates.length)
      return { ok: true, message: 'Every mod is up to date for this Minecraft version.' };
    let n = 0;
    const bad: string[] = [];
    for (const u of r.updates) {
      const x = await this.update(id, u.file);
      if (x.ok) n++;
      else bad.push(`${u.name}: ${x.message}`);
    }
    return {
      ok: n > 0,
      message: `Updated ${n} mod${n === 1 ? '' : 's'}.${bad.length ? ` Not updated: ${bad.join('; ')}` : ''}`,
    };
  }

  async undo(changeId: string): Promise<{ ok: boolean; message: string }> {
    const all = this.history();
    const c = all.find((x) => x.id === changeId);
    const p = c ? this.profile(c.profile) : null;
    if (!c || c.undone || !p) return { ok: false, message: 'Nothing to undo.' };
    if (await this.minecraftRunning()) return { ok: false, message: 'Close Minecraft first.' };
    const d = p.modsDir;
    try {
      if (c.kind === 'disable') renameSync(join(d, `${c.file}.disabled`), join(d, c.file));
      else if (c.kind === 'enable') renameSync(join(d, c.file), join(d, `${c.file}.disabled`));
      else if (c.kind === 'add') rmSync(join(d, c.file), { force: true });
      else if (c.kind === 'update') {
        if (c.newFile) rmSync(join(d, c.newFile), { force: true });
        renameSync(join(d, BACKUP, c.file), join(d, c.file));
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Couldn’t undo it.' };
    }
    c.undone = true;
    writeFileSync(this.historyFile, JSON.stringify(all));
    return { ok: true, message: `Undone: ${c.note}` };
  }
}

interface ModrinthVersion {
  version_number: string;
  files: Array<{ url: string; filename: string; primary: boolean; hashes: { sha1: string } }>;
}

let one: MinecraftMods | null = null;
export const minecraftMods = (): MinecraftMods => (one ??= new MinecraftMods());
