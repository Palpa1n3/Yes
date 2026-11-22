import { app, safeStorage, shell } from 'electron';
import { spawn } from 'node:child_process';
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

  return {
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
      ctx.audit.add('action', `Tidied ${which}: moved ${done.length} files into folders`);
      return {
        moved: done.length,
        into: [...new Set(done.map((m) => m.to.split(/[\\/]/).at(-2)))],
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
      const task: BackgroundTask = {
        id: `bg-${Date.now().toString(36)}`,
        topic,
        status: 'running',
        startedAt: Date.now(),
      };
      tasks.unshift(task);
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
