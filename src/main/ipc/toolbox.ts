import { phoneMessages } from '../services/phone-messages';
import { digestForAi, groupMessages, quickSummary } from '@shared/messages';
import { PcLights } from '../services/openrgb';
import { app, safeStorage, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import si from 'systeminformation';
import { IPC } from '@shared/ipc';
import { ST_API, cleanSmartInput, smartHome, type StFetch } from '@shared/smartthings';
import type { MainContext } from '../context';
import type { NotesStore } from '../services/notes-store';
import { SecretStore } from '../services/secret-store';
import { cyberpunkMods } from '../services/cyberpunk-mods';
import { minecraftMods } from '../services/minecraft-mods';
import { VortexSync } from '../services/vortex-sync';
import { notifyUser } from '../holo';
import { ps } from '../services/system-actions';
import {
  applyTidy,
  checkModsFolder,
  compareBench,
  minecraftInstances,
  optimisationTips,
  planTidy,
  readList,
  runBenchmark,
  searchDocuments,
  summariseMoves,
  undoTidy,
  writeList,
  type BenchResult,
  type Move,
} from '../services/toolbox';
import { handle } from './handle';
import { movesLanded } from '@shared/verify';
import { sessionGuard } from '../services/session-guard';

const DISCORD_RE =
  /^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export interface BackgroundTask {
  id: string;
  topic: string;
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  summary?: string;
}

export function registerToolbox(
  ctx: MainContext,
  d: { notes: NotesStore; anthropicKey(): Promise<string | null> },
): Record<string, (input: unknown) => unknown> {
  const userData = app.getPath('userData');
  const undoFile = join(userData, 'tidy-undo.json');
  const benchFile = join(userData, 'benchmarks.json');
  const discord = new SecretStore(join(userData, 'discord-webhook.bin'), safeStorage);
  const smartToken = new SecretStore(join(userData, 'smartthings-token.bin'), safeStorage);
  const stFetch =
    (token: string): StFetch =>
    async (method, path, body) => {
      const r = await fetch(`${ST_API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
  const tasks: BackgroundTask[] = [];
  const folders = (): Record<string, string> => ({
    downloads: app.getPath('downloads'),
    desktop: app.getPath('desktop'),
    documents: app.getPath('documents'),
  });
  const input = (i: unknown): Record<string, unknown> =>
    i && typeof i === 'object' ? (i as Record<string, unknown>) : {};

  // Mods tab: Cyberpunk 2077 mods (Vortex) and their updates (Nexus Mods).
  const mods = cyberpunkMods();
  handle(IPC.mods.status, () => mods.status());
  handle(IPC.mods.list, () => mods.list());
  handle(IPC.mods.setKey, (k) => mods.setKey(String(k ?? '')));
  handle(IPC.mods.clearKey, () => {
    mods.clearKey();
    return false;
  });
  handle(IPC.mods.openKeyPage, async () => {
    await shell.openExternal('https://www.nexusmods.com/users/myaccount?tab=api');
    return true;
  });
  handle(IPC.mods.check, () => mods.check());
  handle(IPC.mods.update, (id) =>
    typeof id === 'number' ? mods.update(id) : { ok: false, message: 'Which mod?' },
  );
  handle(IPC.mods.updateAll, () => mods.updateAll());
  handle(IPC.mods.diagnose, () => mods.diagnose());
  handle(IPC.mods.loadOrder, () => mods.loadOrder());
  handle(IPC.mods.setOrder, (c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    if (o.kind === 'suggested') return mods.setOrder({ kind: 'suggested' });
    if (o.kind === 'prefer' && typeof o.archive === 'string' && typeof o.over === 'string')
      return mods.setOrder({ kind: 'prefer', archive: o.archive, over: o.over });
    return { ok: false, message: 'Which order?' };
  });
  handle(IPC.mods.resetOrder, () => mods.resetOrder());
  handle(IPC.mods.fixes, () => mods.fixes());
  handle(IPC.mods.outdated, () => mods.findOutdated());
  // Vortex in step: saved mods switched off in Vortex, conflicts settled, replace answered.
  const vortex = new VortexSync(mods);
  // Mods to switch back on: apply straight away (closing and reopening Vortex if it's open),
  // a few seconds later so several queued together go in one go.
  let applyTimer: ReturnType<typeof setTimeout> | null = null;
  mods.onVortexEnable = (ids) => {
    vortex.queueEnable(ids);
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTimer = null;
      void vortex.applyNow().then((r) => {
        if (!/^Nothing|^Already/.test(r.message))
          notifyUser(r.ok ? 'Vortex updated' : 'Vortex', r.message, r.ok ? 'info' : 'warn');
      });
    }, 4000);
  };
  mods.onUpdating = () => vortex.autoReplace();
  handle(IPC.mods.vortexState, async () => {
    const st = vortex.state();
    return {
      vortexRunning: await vortex.vortexRunning(),
      waiting: st.enable.length + mods.removed().filter((r) => !r.vortexOff).length,
      lastRun: st.lastRun,
      rulesAdded: [...st.rulesAdded].reverse().slice(0, 50),
    };
  });
  handle(IPC.mods.vortexSync, async () =>
    (await vortex.vortexRunning()) && vortex.due() ? vortex.applyNow() : vortex.sync(true),
  );
  // Every minute: when Vortex and the game are closed and something's waiting, do it.
  let vortexWasOpen = false;
  let lastApply = 0;
  let lastDeploy = 0;
  let lastWrongTold = 0;
  const vt = setInterval(async () => {
    // Also every time Vortex is closed (new installs may have brought new conflicts).
    if (vortex.isApplying()) return;
    const open = await vortex.vortexRunning();
    const justClosed = vortexWasOpen && !open;
    const justOpened = !vortexWasOpen && open;
    vortexWasOpen = open;
    // Vortex just opened after Alton changed it while it was closed: deploy.
    // …or it's open and a deploy is still owed (tried at most every 5 minutes).
    if (
      justOpened ||
      (open && vortex.state().needsDeploy && Date.now() - lastDeploy > 5 * 60_000)
    ) {
      lastDeploy = Date.now();
      void vortex.deployWhenOpen().then((ok) => {
        if (ok) notifyUser('Vortex', 'Deployed your mods so Alton’s changes take effect.', 'info');
        // Vortex came up on another game or profile: say so (once each time).
        const w = vortex.state().wrongProfile;
        if (!ok && w && w.at !== lastWrongTold && Date.now() - w.at < 5 * 60_000) {
          lastWrongTold = w.at;
          notifyUser(
            'Vortex',
            w.gameId && w.gameId !== 'cyberpunk2077'
              ? `Vortex opened on another game (${w.gameId}), so Alton didn't deploy anything. Switch Vortex back to Cyberpunk 2077 when you want Alton's changes applied.`
              : `Vortex opened on a different Cyberpunk profile, so Alton didn't deploy (that could take your mods out). Switch back to your usual profile in Vortex (Profiles).`,
            'warn',
          );
        }
      });
    }
    // Changes waiting while Vortex stays open (e.g. from before an update): apply them, at most
    // every 10 minutes (closes and reopens Vortex).
    // (Only for mods to switch back on, which the sync always clears, so this can't loop.)
    if (open && vortex.state().enable.length > 0 && Date.now() - lastApply > 10 * 60_000) {
      lastApply = Date.now();
      void vortex.applyNow().then((r) => {
        if (!/^Nothing|^Already/.test(r.message))
          notifyUser(r.ok ? 'Vortex updated' : 'Vortex', r.message, r.ok ? 'info' : 'warn');
      });
    } else if (justClosed || (!open && vortex.due()))
      void vortex.sync(justClosed).then((r) => {
        if (r.ok && !/^Nothing/.test(r.message)) notifyUser('Vortex updated', r.message, 'info');
      });
  }, 60_000);
  vt.unref?.();
  handle(IPC.mods.recommend, (fresh) => mods.recommend(fresh === true));
  handle(IPC.mods.hideRec, (id) => {
    if (typeof id === 'number') mods.hideRecommendation(id);
    return true;
  });
  handle(IPC.mods.install, (id) =>
    typeof id === 'number' ? mods.install(id) : { ok: false, message: 'Which mod?' },
  );
  handle(IPC.mods.deps, (fresh) => mods.dependencies(fresh === true));
  handle(IPC.mods.installDeps, () => mods.installDependencies());
  handle(IPC.mods.setShowAdult, (on) => {
    mods.setShowAdult(on === true);
    return true;
  });
  const folderList = (f: unknown): string[] =>
    Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string').slice(0, 500) : [];
  handle(IPC.mods.remove, (f) => mods.removeMods(folderList(f)));
  handle(IPC.mods.restore, (f) => mods.restoreMods(folderList(f)));
  handle(IPC.mods.autofix, async () => {
    const r = await mods.autofix();
    return { message: r.message, state: mods.fixes() };
  });
  handle(IPC.mods.undoFix, (id) => mods.undoFix(String(id ?? '')));
  handle(IPC.mods.setAutoFix, (on) => {
    mods.setAutoFix(on === true);
    return mods.fixes();
  });
  // Fix Cyberpunk launch problems by itself (when switched on in the Mods tab).
  mods.watch((title, body) => notifyUser(title, body, 'warn'));
  // Big changes to the game's mods that Alton didn't make (e.g. Vortex on an empty profile).
  mods.watchDrift((title, body) => notifyUser(title, body, 'warn'));
  handle(IPC.mods.cancel, () => {
    mods.cancelUpdates();
    return true;
  });
  handle(IPC.mods.open, (what, id) =>
    ['folder', 'page', 'game', 'vortex', 'removed'].includes(String(what))
      ? mods.open(what, typeof id === 'number' ? id : undefined)
      : 'Open what?',
  );

  // Minecraft tab: Lunar Client / .minecraft mods (Fabric) and Modrinth updates.
  const mc = minecraftMods();
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  handle(IPC.minecraft.profiles, () =>
    mc.profiles().map((p) => ({
      id: p.id,
      name: p.name,
      launcher: p.launcher,
      gameVersion: p.gameVersion,
      loader: p.loader,
      modsDir: p.modsDir,
      mods: p.mods,
      current: p.current,
    })),
  );
  handle(IPC.minecraft.scan, (p) => mc.scan(str(p)));
  handle(IPC.minecraft.checkUpdates, (p) => mc.checkUpdates(str(p)));
  handle(IPC.minecraft.setEnabled, (p, f, on) => mc.setEnabled(str(p), str(f), on === true));
  handle(IPC.minecraft.update, (p, f) => mc.update(str(p), str(f)));
  handle(IPC.minecraft.updateAll, (p) => mc.updateAll(str(p)));
  handle(IPC.minecraft.addMissing, (p, id) => mc.addMissing(str(p), str(id)));
  handle(IPC.minecraft.fixAll, async (p) => {
    const r = await mc.fixAll(str(p));
    return { ok: r.ok, message: r.message };
  });
  handle(IPC.minecraft.history, () => mc.history().reverse().slice(0, 50));
  handle(IPC.minecraft.undo, (id) => mc.undo(str(id)));

  // Settings › Connections › Smart home: SmartThings personal access token.
  handle(IPC.smarthome.status, () => smartToken.has());
  handle(IPC.smarthome.set, async (raw) => {
    const t = String(raw ?? '').trim();
    if (!/^[\w-]{20,100}$/.test(t))
      return {
        ok: false,
        message:
          'That doesn’t look like a SmartThings token (make one at account.smartthings.com/tokens).',
      };
    try {
      const r = await stFetch(t)('GET', '/devices');
      if (r.status === 401 || r.status === 403)
        return { ok: false, message: 'SmartThings refused that token.' };
      if (r.status !== 200) return { ok: false, message: `SmartThings said ${r.status}.` };
    } catch {
      return { ok: false, message: 'Couldn’t reach SmartThings. Check the internet.' };
    }
    await smartToken.set(t);
    return { ok: true, message: 'Connected. Try “turn the living room lights off”.' };
  });
  handle(IPC.smarthome.clear, async () => {
    await smartToken.clear();
    return false;
  });
  // Settings › Connections › Discord: save / remove the webhook.
  handle(IPC.discord.status, () => discord.has());
  handle(IPC.discord.set, async (url) => {
    const u = String(url).trim();
    if (!DISCORD_RE.test(u))
      return {
        ok: false,
        message:
          'That doesn’t look like a Discord webhook link (Server Settings › Integrations › Webhooks › Copy URL).',
      };
    await discord.set(u);
    return { ok: true, message: 'Saved. Ask Alton to “post to Discord: …”.' };
  });
  handle(IPC.discord.clear, async () => {
    await discord.clear();
    return false;
  });

  // PC lighting through OpenRGB; other lighting apps running may take some lights back.
  const lights = new PcLights({
    rivals: () =>
      new Promise<string[]>((resolve) => {
        execFile(
          'tasklist',
          ['/fo', 'csv', '/nh'],
          { windowsHide: true, timeout: 8000 },
          (err, out) => {
            if (err) return resolve([]);
            const names = new Set(
              String(out)
                .split(String.fromCharCode(10))
                .map((l) => (l.split('","')[0] ?? '').replace(/^"/, '').toLowerCase()),
            );
            const found: string[] = [];
            if (names.has('armourycrate.exe') || names.has('lightingservice.exe'))
              found.push('Armoury Crate');
            if (names.has('icue.exe')) found.push('iCUE');
            if (names.has('signalrgb.exe')) found.push('SignalRGB');
            resolve(found);
          },
        );
      }),
  });

  return {
    pc_lights: (raw) => lights.tool(raw),
    organize_folder: async (raw) => {
      const which = String(input(raw).folder ?? 'downloads').toLowerCase();
      const dir = folders()[which];
      if (!dir) return { error: 'Folder must be downloads, desktop or documents.' };
      const plan = planTidy(dir);
      if (!plan.length) return { result: `Nothing to tidy: ${which} has no loose files.` };
      const ok = await ctx.askApproval?.(
        `Tidy ${which}: move ${plan.length} files into folders by type?`,
        `${summariseMoves(plan)}\n\nNothing is deleted. Say “undo the tidy-up” to put everything back.`,
      );
      if (!ok) return { result: 'The user said no; nothing was moved.' };
      const done = applyTidy(plan);
      writeList<Move>(undoFile, done);
      // Checked after: every file really in its new folder and gone from the old one.
      const { landed, missing } = movesLanded(done, existsSync);
      const skipped = plan.length - done.length + missing.length;
      ctx.audit.add(
        'action',
        `Tidied ${which}: moved ${landed.length} files into folders${skipped ? ` (${skipped} couldn't be moved)` : ''}`,
        skipped === 0,
      );
      return {
        moved: landed.length,
        into: [...new Set(landed.map((m) => m.to.split(/[\\/]/).at(-2)))],
        ...(skipped
          ? {
              notMoved: `${skipped} file${skipped === 1 ? '' : 's'} couldn't be moved (probably open in another app); they're where they were.`,
            }
          : {}),
        undo: 'Say "undo the tidy-up".',
      };
    },
    undo_organize: () => {
      const moves = readList<Move>(undoFile);
      if (!moves.length) return { error: 'There is no tidy-up to undo.' };
      const n = undoTidy(moves);
      writeList(undoFile, []);
      ctx.audit.add('action', `Undid the last tidy-up: put back ${n} files`);
      return { putBack: n };
    },
    search_documents: (raw) => {
      const q = String(input(raw).query ?? '').slice(0, 200);
      const p = app.getPath.bind(app);
      const roots = [
        p('documents'),
        p('desktop'),
        p('downloads'),
        join(homedir(), 'OneDrive', 'Documents'),
      ];
      const hits = searchDocuments(roots, q);
      return hits.length
        ? hits.map((h) => ({ file: h.path, modified: h.modified, snippet: h.snippet }))
        : {
            found:
              'No documents in Documents, Desktop or Downloads mention that (text, Word and similar files are searched; not PDFs).',
          };
    },
    check_minecraft_mods: (raw) => {
      const want = String(input(raw).instance ?? '').toLowerCase();
      const list = minecraftInstances(
        process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
        homedir(),
      ).filter((x) => !want || x.name.toLowerCase().includes(want));
      if (!list.length)
        return {
          error:
            'No modded Minecraft installs found (default, CurseForge, Prism, Modrinth or Technic).',
        };
      return list
        .slice(0, 6)
        .map((x) => checkModsFolder(x.dir, x.name))
        .filter(Boolean);
    },
    get_optimization_tips: async () => {
      const win = process.platform === 'win32';
      const [mem, fs, time, procs] = await Promise.all([
        si.mem().catch(() => null),
        si.fsSize().catch(() => []),
        si.time(),
        ctx.telemetry.snapshotWithProcesses().catch(() => null),
      ]);
      let startupApps: string[] = [];
      let powerPlan: string | null = null;
      if (win) {
        const s = await ps(
          '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_StartupCommand | Select-Object -ExpandProperty Name',
          20_000,
        );
        startupApps = s.out
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);
        const p = await ps('powercfg /getactivescheme', 10_000);
        powerPlan = /\(([^)]+)\)/.exec(p.out)?.[1] ?? null;
      }
      const data = {
        startupApps,
        powerPlan,
        uptimeHours: Math.round(Number(time.uptime) / 3600),
        disks: fs
          .filter((x) => x.size > 0)
          .map((x) => ({ mount: x.mount, freePct: ((x.size - x.used) / x.size) * 100 })),
        memUsedPct: mem && mem.total ? ((mem.total - mem.available) / mem.total) * 100 : 0,
        topMemory: (procs?.processes ?? [])
          .slice()
          .sort((a, b) => b.mem - a.mem)
          .slice(0, 5)
          .map((x) => ({ name: x.name, gb: x.mem / 1024 ** 3 })),
      };
      return { tips: optimisationTips(data), details: data };
    },
    run_benchmark: () => {
      const history = readList<BenchResult>(benchFile);
      const r = runBenchmark(tmpdir());
      writeList(benchFile, [...history, r].slice(-30));
      const own = app.getAppMetrics().reduce((n, m) => n + (m.memory?.workingSetSize ?? 0), 0);
      return {
        result: {
          processorHashingMBperSec: r.cpuSingleMBs,
          diskWriteMBperSec: r.diskWriteMBs,
          diskReadMBperSec: r.diskReadMBs,
          memoryCopyGBperSec: r.memoryGBs,
          altonMemoryMB: Math.round(own / 1024),
        },
        comparedWithLastRun: compareBench(r, history.at(-1)),
        note: 'Quick checks (a few seconds), best for comparing this PC with itself over time.',
      };
    },
    play_on_spotify: async (raw) => {
      const q = String(input(raw).query ?? '')
        .trim()
        .slice(0, 120);
      if (!q) return { error: 'Missing "query".' };
      try {
        await shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
        return { opened: `Spotify search for “${q}” (pick the result to play).` };
      } catch {
        await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
        return { opened: `Spotify web search for “${q}”.` };
      }
    },
    summarise_messages: (raw) => {
      const pm = phoneMessages();
      const h = Number(input(raw).hours);
      const hours = Number.isFinite(h) && h > 0 ? Math.min(72, h) : 12;
      const msgs = pm?.since(Date.now() - hours * 3_600_000) ?? [];
      const g = groupMessages(msgs);
      return {
        summary: g.length ? quickSummary(g) : 'No phone messages have reached the PC.',
        details: digestForAi(g),
      };
    },
    reply_phone_message: async (raw) => {
      const o = input(raw);
      const pm = phoneMessages();
      if (!pm) return { error: 'Phone messages are not set up.' };
      return {
        result: await pm.reply(String(o.text ?? ''), typeof o.to === 'string' ? o.to : undefined),
      };
    },
    cyberpunk_mods: async (raw) => {
      const o = input(raw);
      const action = String(o.action ?? 'summary');
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const pick = (): { modId: number | null; name: string } | null => {
        const found = name ? mods.find(name) : [];
        return found[0] ?? null;
      };
      if (action === 'dependencies') {
        const r = await mods.dependencies();
        if (r.error && !r.missing.length) return { error: r.error };
        return {
          checked: r.checked,
          missing: r.missing.slice(0, 30).map((m) => ({
            name: m.name,
            neededBy: m.neededBy.slice(0, 5),
            savedByAlton: m.saved,
          })),
        };
      }
      if (action === 'install_dependencies') return mods.installDependencies();
      if (action === 'recommend') {
        const r = await mods.recommend();
        if (r.error) return { error: r.error };
        return {
          recommendations: r.items.slice(0, 12).map((i) => ({
            nexusId: i.modId,
            name: i.name,
            what: i.summary,
            category: i.category,
            endorsements: i.endorsements,
            why: i.reasons,
          })),
          note: 'Pick a few that suit what the user likes and say why in a sentence each. To install one, use action install with its name (the user approves).',
        };
      }
      if (action === 'install') {
        const r = await mods.recommend();
        const q = name.toLowerCase();
        const hit =
          r.items.find((i) => i.name.toLowerCase() === q) ??
          r.items.find((i) => i.name.toLowerCase().includes(q));
        if (!hit) return { error: `“${name}” isn’t in the recommendations.` };
        const ok = await ctx.askApproval?.(
          `Install ${hit.name}?`,
          'Vortex downloads and installs it (Premium), or its Nexus Files page opens.',
        );
        if (!ok) return { result: 'Not installed: you said no.' };
        return { result: (await mods.install(hit.modId)).message };
      }
      if (action === 'outdated') {
        const r = await mods.findOutdated();
        return {
          outdated: r.mods.map((m) => ({
            name: m.name,
            reasons: m.reasons,
            updateAvailable: m.hasUpdate,
          })),
          alreadyRemoved: r.removed.map((m) => m.name),
          note: 'Use action remove_outdated to remove them all (the user approves); they can be put back in the Mods tab.',
        };
      }
      if (action === 'remove_outdated') {
        const r = await mods.findOutdated();
        if (!r.mods.length) return { result: 'No outdated mods found.' };
        const ok = await ctx.askApproval?.(
          `Remove ${r.mods.length} outdated Cyberpunk mod${r.mods.length === 1 ? '' : 's'}?`,
          `${r.mods.map((m) => m.name).join(', ')}\n\nTheir files are moved out of the game folder and can be put back in the Mods tab.`,
        );
        if (!ok) return { result: 'Not removed: you said no.' };
        return { result: (await mods.removeMods(r.mods.map((m) => m.folder))).message };
      }
      if (action === 'fix') {
        const ok = await ctx.askApproval?.(
          'Fix Cyberpunk’s launch problem?',
          'Alton may switch off the crashing RED4ext plugin, send an update to Vortex, or deploy REDmod again without broken script mods. Each can be undone in the Mods tab.',
        );
        if (!ok) return { result: 'Not changed: you said no.' };
        return { result: (await mods.autofix()).message };
      }
      if (action === 'load_order') {
        const r = await mods.loadOrder();
        return {
          archives: r.archives,
          orderFile: r.modlist,
          clashes: r.conflicts.length,
          topClashes: r.conflicts
            .slice(0, 20)
            .map(
              (c) =>
                `${c.winner}${c.winnerMod ? ` (${c.winnerMod})` : ''} wins over ${c.loser}${c.loserMod ? ` (${c.loserMod})` : ''}: ${c.files} files${c.variants ? ' — these look like alternative versions of one mod; usually only one should be installed' : ''}`,
            ),
          suggestedMoves: r.moves.map((m) => `${m.archive} before ${m.before}: ${m.reason}`),
          redmod: r.redmod?.failed ? r.redmod.verdict : 'last REDmod deploy OK',
          note: 'Archives load in name order unless archive\\pc\\mod\\modlist.txt lists them; the first loaded wins a clash. Use action apply_load_order (the user approves) to save the suggested order.',
        };
      }
      if (action === 'apply_load_order') {
        const r = await mods.loadOrder();
        if (!r.moves.length) return { result: 'Nothing to change: the order is already right.' };
        const ok = await ctx.askApproval?.(
          `Change the Cyberpunk load order (${r.moves.length} move${r.moves.length === 1 ? '' : 's'})?`,
          r.moves.map((m) => `${m.archive} before ${m.before}`).join('\n'),
        );
        if (!ok) return { result: 'Not changed: you said no.' };
        return { result: (await mods.setOrder({ kind: 'suggested' })).message };
      }
      if (action === 'diagnose') {
        const d = await mods.diagnose();
        return {
          verdict: d.verdict,
          gameVersion: d.gameVersion,
          stoppedOn: d.culprit,
          vortexMod: d.vortexMod,
          olderThanPatch: d.outdated,
          scriptErrors: d.scriptErrors,
          crash: d.crash
            ? {
                where: d.crash.recent[d.crash.recent.length - 1]?.where,
                modsOnStack: d.crash.recent[d.crash.recent.length - 1]?.mods,
                culprit: d.crash.culprit,
                quest: d.crash.context?.quest,
                district: d.crash.context?.district,
                minutesPlayed: d.crash.context ? Math.round(d.crash.context.session / 60) : null,
                tweakXLRejected: d.crash.tweakErrors,
              }
            : null,
          recentLaunches: d.runs.slice(-6).map((r) => ({
            at: new Date(r.at).toISOString(),
            version: r.gameVersion,
            outcome: r.outcome,
            stoppedOn: r.stoppedOn,
          })),
        };
      }
      if (action === 'check') {
        const s = await mods.check();
        if (s.error) return { error: s.error };
        return {
          updates: s.updates.map(
            (u) => `${u.name}: ${u.installed || '?'} → ${u.latest || 'newer'}`,
          ),
          checked: s.mods,
        };
      }
      if (action === 'find') {
        const found = mods.find(name).slice(0, 15);
        return {
          mods: found.map((m) => ({
            name: m.name,
            version: m.version,
            nexusId: m.modId,
            latest: m.modId ? (mods.info(m.modId)?.version ?? null) : null,
          })),
        };
      }
      if (action === 'open') {
        const what =
          o.what === 'page' || o.what === 'game' || o.what === 'vortex' ? o.what : 'folder';
        if (what === 'game' || what === 'vortex') return { result: await mods.open(what) };
        const m = pick();
        if (!m?.modId) return { error: `No installed mod matches “${name}”.` };
        return { result: await mods.open(what, m.modId) };
      }
      if (action === 'update') {
        const s = await mods.status();
        if (!s.keySet)
          return { error: 'Nexus Mods isn’t connected: add the API key in the Mods tab.' };
        if (name.toLowerCase() === 'all') {
          if (!s.updates.length)
            return { result: 'Everything is up to date (as of the last check).' };
          const ok = await ctx.askApproval?.(
            `Update ${s.updates.length} Cyberpunk mod${s.updates.length === 1 ? '' : 's'}?`,
            s.account?.premium
              ? 'Vortex will download and install them.'
              : 'Each one opens on Nexus Mods for you to download with Vortex.',
          );
          if (!ok) return { result: 'Not updated: you said no.' };
          return { result: (await mods.updateAll()).message };
        }
        const m = pick();
        if (!m?.modId) return { error: `No installed mod matches “${name}”.` };
        const ok = await ctx.askApproval?.(
          `Update ${m.name}?`,
          s.account?.premium
            ? 'Vortex will download and install it.'
            : 'Its Files page opens on Nexus Mods.',
        );
        if (!ok) return { result: 'Not updated: you said no.' };
        return { result: (await mods.update(m.modId)).message };
      }
      const s = await mods.status();
      return {
        game: s.game ? 'found' : 'not found',
        vortexMods: s.mods,
        gameFolderFiles: s.files,
        nexusConnected: s.keySet,
        premium: s.account?.premium ?? false,
        lastCheck: s.lastCheck ? new Date(s.lastCheck).toISOString() : 'never',
        updates: s.updates
          .slice(0, 30)
          .map((u) => `${u.name}: ${u.installed || '?'} → ${u.latest || 'newer'}`),
      };
    },
    minecraft_mods: async (raw) => {
      const o = input(raw);
      const action = String(o.action ?? 'scan');
      const all = mc.profiles();
      const want = typeof o.profile === 'string' ? o.profile.toLowerCase() : '';
      const p =
        all.find((x) => want && x.name.toLowerCase().includes(want)) ??
        all.find((x) => x.current) ??
        all[0];
      if (!p)
        return {
          error: 'No Minecraft profiles with mods were found (Lunar Client or .minecraft).',
        };
      if (action === 'profiles')
        return {
          profiles: all.map(
            (x) =>
              `${x.name}: ${x.mods} mods, Minecraft ${x.gameVersion || '?'}${x.current ? ' (selected in Lunar)' : ''}`,
          ),
        };
      if (action === 'fix') {
        const ok = await ctx.askApproval?.(
          `Fix the mods in ${p.name}?`,
          'Alton switches off duplicate copies, adds missing required mods from Modrinth and updates (or switches off) mods made for another Minecraft version. Every change can be undone in the Minecraft tab.',
        );
        if (!ok) return { result: 'Not changed: you said no.' };
        return { result: (await mc.fixAll(p.id)).message };
      }
      if (action === 'update_all') {
        const ok = await ctx.askApproval?.(
          `Update the mods in ${p.name} from Modrinth?`,
          'Old versions are kept as backups.',
        );
        if (!ok) return { result: 'Not updated: you said no.' };
        return { result: (await mc.updateAll(p.id)).message };
      }
      const r = action === 'check_updates' ? await mc.checkUpdates(p.id) : await mc.scan(p.id);
      return {
        profile: `${p.name} (Minecraft ${r.profile?.gameVersion || '?'}, ${r.mods.filter((m) => !m.library).length} mods)`,
        problems: r.problems.slice(0, 30).map((x) => x.text),
        lastCrash: r.crash ? { description: r.crash.description, blames: r.crash.suspects } : null,
        updates: r.updates.map((u) => `${u.name} ${u.from} → ${u.to}`),
        note: 'To fix, use action fix (the user approves). Changes can be undone in the Minecraft tab.',
      };
    },
    smart_home: async (raw) => {
      const i = cleanSmartInput(raw);
      if (!i) return { error: 'Unknown smart-home action.' };
      const token = await smartToken.get();
      if (!token)
        return {
          error:
            'SmartThings isn’t connected. The user adds a token in Settings › Connections › Smart home.',
        };
      try {
        const result = await smartHome(stFetch(token), i, async (q) =>
          Boolean(await ctx.askApproval?.(q, 'Alton will do this through SmartThings.')),
        );
        if (i.action !== 'list' && i.action !== 'status')
          ctx.audit.add('action', `Smart home: ${result.slice(0, 80)}`, true);
        return { result };
      } catch {
        return { error: 'Couldn’t reach SmartThings.' };
      }
    },
    post_to_discord: async (raw) => {
      const msg = String(input(raw).message ?? '')
        .trim()
        .slice(0, 1900);
      if (!msg) return { error: 'Missing "message".' };
      const url = await discord.get();
      if (!url)
        return {
          error:
            'No Discord webhook saved. The user can add one in Settings › Connections › Discord.',
        };
      const ok = await ctx.askApproval?.('Post this to your Discord channel?', msg);
      if (!ok) return { result: 'The user said no; nothing was posted.' };
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: msg, allowed_mentions: { parse: [] } }),
      });
      ctx.audit.add('action', `Posted to Discord: ${msg.slice(0, 80)}`, r.ok);
      return r.ok ? { posted: true } : { error: `Discord said ${r.status}.` };
    },
    run_self_test: async () => {
      const dir = ctx.settings.get().sourceDir;
      if (!dir || !existsSync(join(dir, 'package.json')))
        return { error: 'Set the source folder first (Settings › Advanced › Self-debugging).' };
      if (!existsSync(join(dir, 'node_modules')))
        return { error: 'The source folder has no node_modules; run npm install there first.' };
      return new Promise((resolve) => {
        let out = '';
        const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], {
          cwd: dir,
          shell: process.platform === 'win32',
          windowsHide: true,
          env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
        });
        const timer = setTimeout(() => p.kill(), 6 * 60_000);
        p.stdout?.on('data', (b: Buffer) => (out = (out + b.toString()).slice(-60_000)));
        p.stderr?.on('data', (b: Buffer) => (out = (out + b.toString()).slice(-60_000)));
        p.on('close', (code) => {
          clearTimeout(timer);
          // Strip colour codes (ESC [ … m).
          const lines = out
            .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
            .split('\n');
          const failing = lines.filter((l) => /FAIL|×|AssertionError|Error:/.test(l)).slice(0, 30);
          resolve({
            passed: code === 0,
            summary: lines.filter((l) => /Test Files|Tests\s/.test(l)).join(' | '),
            failing,
            tail: lines.slice(-25).join('\n'),
          });
        });
        p.on('error', (e) => resolve({ error: e.message }));
      });
    },
    start_background_research: async (raw) => {
      const topic = String(input(raw).topic ?? '')
        .trim()
        .slice(0, 300);
      if (!topic) return { error: 'Missing "topic".' };
      const key = await d.anthropicKey();
      if (!key) return { error: 'Background research needs Claude (an API key).' };
      const paused = ctx.usage.blocked('research');
      if (paused) return { error: paused };
      const task: BackgroundTask = {
        id: `bg-${Date.now().toString(36)}`,
        topic,
        status: 'running',
        startedAt: Date.now(),
      };
      tasks.unshift(task);
      try {
        sessionGuard().researchStarted(topic);
      } catch {
        /* not fatal */
      }
      void (async () => {
        try {
          const client = new Anthropic({ apiKey: key, maxRetries: 2 });
          const model = ctx.settings.get().researchModel;
          const tools: Anthropic.Beta.BetaToolUnion[] =
            model === 'claude-haiku-5-5'
              ? [
                  { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
                  { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 },
                ]
              : [
                  { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
                  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 },
                ];
          const msgs: Anthropic.Beta.BetaMessageParam[] = [
            {
              role: 'user',
              content: `Research this thoroughly on the web and write a clear, well-organised summary for me (plain text, short headings and bullet points are fine, list the main sources at the end): ${topic}`,
            },
          ];
          let text = '';
          for (let i = 0; i < 6; i++) {
            const m = await client.beta.messages.create({
              model,
              max_tokens: 8000,
              tools,
              messages: msgs,
            });
            ctx.usage.record(model, m.usage, 'research');
            msgs.push({ role: 'assistant', content: m.content });
            text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
            if (m.stop_reason !== 'pause_turn') break;
          }
          task.status = 'done';
          task.summary = text.slice(0, 600);
          d.notes.addNote(`Research: ${topic}\n\n${text}`.slice(0, 8000));
          const line = `Your background research on “${topic}” is ready. It's saved in Notes.`;
          ctx.notify(line);
          ctx.command({ type: 'notice', text: line });
          ctx.audit.add('action', `Background research finished: ${topic}`);
        } catch (err) {
          task.status = 'failed';
          task.summary = err instanceof Error ? err.message : String(err);
          ctx.command({
            type: 'notice',
            text: `Background research on “${topic}” failed: ${task.summary}`,
          });
        } finally {
          try {
            sessionGuard().researchEnded(topic);
          } catch {
            /* not fatal */
          }
        }
      })();
      return {
        started: topic,
        note: 'It runs in the background; the result will be saved in Notes and announced.',
      };
    },
    list_background_tasks: () =>
      tasks.length
        ? tasks.slice(0, 10).map((t) => ({
            topic: t.topic,
            status: t.status,
            started: new Date(t.startedAt).toLocaleTimeString(),
            summary: t.summary,
          }))
        : { tasks: [] },
  };
}
