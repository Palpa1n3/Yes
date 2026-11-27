/** Phone companion: a small web app served on the home network (off by default).
 *  A phone pairs once with a 6-digit code shown on the PC and gets a random token; with it the
 *  phone can chat with Alton, see PC status and notifications, answer Agent Mode, press the
 *  emergency stop and send files to Downloads\From phone. Only private (LAN) addresses are
 *  served, code guesses are rate-limited, and paired phones can be forgotten at any time. */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { linkKind } from '@shared/remote-link';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  createWriteStream,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { REMOTE_PAGE } from './remote-page';

export const REMOTE_PORT = 47615;
const MAX_UPLOAD = 200 * 1024 * 1024;

export interface RemoteStatus {
  name: string;
  pc: {
    cpu: number | null;
    memPct: number | null;
    cpuTemp: number | null;
    uptimeHours: number | null;
  };
  playing: string | null;
  gaming: string | null;
  agent: {
    state: string;
    task: string;
    last: string;
    question: { id: string; kind: string; text: string } | null;
  };
  notices: Array<{ at: number; text: string }>;
  approvals: Array<{ id: string; title: string; detail: string }>;
  /** The latest messages in the chat open on the PC. */
  history: Array<{ who: 'you' | 'alton'; text: string }>;
  /** Alton's picture of what's going on on the PC right now (shared/context.ts). */
  now?: string;
}

/** Where the Android app's pages come from (Capacitor's https scheme). Calls still need pairing. */
export const ANDROID_APP_ORIGIN = 'https://localhost';

export interface RemoteDeps {
  /** The phone-only app's site (e.g. https://name.github.io), allowed to ping. */
  pingOrigin?(): string;
  /** The PC app's version, shown on the phone. */
  version?(): string;
  status(): RemoteStatus;
  /** Send a message to Alton as if typed; resolves with the reply text. */
  message(text: string): Promise<string>;
  emergencyStop(): void;
  agentAnswer(id: string, answer: string | boolean): void;
  approve(id: string, ok: boolean): void;
  /** Where uploaded files go. */
  uploadDir(): string;
  /** Paired-device token hashes are kept here. */
  file?: string;
  /** Allow unencrypted connections over the home Wi-Fi too (off: Tailscale only). */
  allowPlainLan?(): boolean;
  log?(text: string): void;
  /** Everything else the phone app asks for (chats, notes, controls…). */
  route?(
    method: string,
    path: string,
    body: Record<string, unknown>,
    query: URLSearchParams,
  ): Promise<RouteResult | null> | RouteResult | null;
}

export type RouteResult =
  | { status?: number; json: unknown }
  | { status?: number; jpeg: Buffer }
  | { status?: number; mp3: Uint8Array };

/** 10.x, 172.16-31.x, 192.168.x, link-local, loopback and IPv6 ULA/link-local. */
export function isPrivateAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/, '');
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(a)) return true;
  // Tailscale (100.64.0.0/10): your own devices, connected from anywhere.
  const t = /^100\.(\d+)\./.exec(a);
  if (t && Number(t[1]) >= 64 && Number(t[1]) <= 127) return true;
  const m = /^172\.(\d+)\./.exec(a);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return a === '::1' || /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a);
}

/** A safe file name for an upload (no folders, no odd characters, no executables blocked
 *  silently: they keep a .download suffix so they can't run by a double-click by accident). */
export function safeUploadName(raw: string): string {
  let n = basename(raw.replace(/\\/g, '/'))
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\p{Cc}/gu, '_')
    .replace(/^\.+/, '')
    .slice(0, 120)
    .trim();
  if (!n) n = 'file';
  if (/^\.(exe|bat|cmd|com|msi|ps1|vbs|js|jse|scr|lnk|reg|hta|pif|cpl)$/i.test(extname(n)))
    n += '.download';
  return n;
}

const hash = (t: string): string => createHash('sha256').update(t).digest('hex');

export class RemoteServer {
  private server: Server | null = null;
  private code = '';
  private tokens: string[] = []; // sha256 of each paired device token
  private fails: number[] = [];
  private locked = false;

  constructor(private readonly d: RemoteDeps) {
    try {
      if (d.file && existsSync(d.file)) {
        const raw = JSON.parse(readFileSync(d.file, 'utf8')) as unknown;
        if (Array.isArray(raw)) this.tokens = raw.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      /* none paired */
    }
  }

  get running(): boolean {
    return !!this.server;
  }

  pairingCode(): string {
    return this.code;
  }

  pairedCount(): number {
    return this.tokens.length;
  }

  newCode(): string {
    this.code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.fails = [];
    this.locked = false;
    return this.code;
  }

  forgetAll(): void {
    this.tokens = [];
    this.save();
  }

  start(port = REMOTE_PORT): Promise<void> {
    if (this.server) return Promise.resolve();
    this.newCode();
    const srv = createServer((req, res) => void this.route(req, res));
    this.server = srv;
    return new Promise((resolve, reject) => {
      srv.once('error', (e) => {
        this.server = null;
        reject(e);
      });
      srv.listen(port, '0.0.0.0', () => resolve());
    });
  }

  /** The port actually listened on (for tests that use port 0). */
  port(): number {
    const a = this.server?.address();
    return a && typeof a === 'object' ? a.port : 0;
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    this.code = '';
  }

  private save(): void {
    if (!this.d.file) return;
    try {
      mkdirSync(dirname(this.d.file), { recursive: true });
      writeFileSync(`${this.d.file}.tmp`, JSON.stringify(this.tokens));
      renameSync(`${this.d.file}.tmp`, this.d.file);
    } catch {
      /* not fatal */
    }
  }

  private authed(req: IncomingMessage): boolean {
    const m = /^Bearer ([a-f0-9]{64})$/.exec(String(req.headers.authorization ?? ''));
    if (!m?.[1]) return false;
    const h = Buffer.from(hash(m[1]));
    return this.tokens.some((t) => {
      const b = Buffer.from(t);
      return b.length === h.length && timingSafeEqual(b, h);
    });
  }

  /** Pairing: 5 wrong codes a minute or 10 in total locks pairing until a new code is made. */
  pair(code: string, now = Date.now()): string | null {
    if (this.locked || !this.code) return null;
    this.fails = this.fails.filter((t) => now - t < 60_000);
    if (this.fails.length >= 5) return null;
    const ok =
      code.length === this.code.length &&
      timingSafeEqual(Buffer.from(code), Buffer.from(this.code));
    if (!ok) {
      this.fails.push(now);
      if (this.fails.length >= 10) this.locked = true;
      return null;
    }
    const token = randomBytes(32).toString('hex');
    this.tokens = [...this.tokens, hash(token)].slice(-5);
    this.save();
    this.newCode(); // each code works once
    this.d.log?.('A phone was paired');
    return token;
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (code: number, body: unknown, type = 'application/json'): void => {
      res.writeHead(code, {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        ...(type.startsWith('text/html')
          ? {
              'content-security-policy':
                "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:",
            }
          : {}),
      });
      res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
    };
    try {
      if (!isPrivateAddress(req.socket.remoteAddress))
        return send(403, { error: 'Home network only.' });
      // Plain home Wi-Fi isn't encrypted: only when switched on (Tailscale always is).
      if (linkKind(req.socket.remoteAddress) === 'lan' && !this.d.allowPlainLan?.())
        return send(403, {
          error:
            'Unencrypted home-Wi-Fi connections are switched off. Use the PC’s Tailscale address (https://….ts.net), or allow home Wi-Fi in Alton’s Settings › Privacy › Phone companion.',
        });
      const url = new URL(req.url ?? '/', 'http://local');
      // The phone app (GitHub Pages) talks to the API directly: allow exactly its origin.
      // Also the Android app, whose pages live at https://localhost on the phone itself.
      const origin = String(req.headers.origin ?? '');
      const site = this.d.pingOrigin?.() ?? '';
      const fromApp = !!origin && (origin === site || origin === ANDROID_APP_ORIGIN);
      if (fromApp && url.pathname.startsWith('/api/')) {
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('access-control-allow-private-network', 'true');
        res.setHeader('access-control-expose-headers', 'content-type');
        res.setHeader('vary', 'Origin');
      }
      if (req.method === 'OPTIONS') {
        if (!fromApp || !url.pathname.startsWith('/api/')) return send(403, { error: 'No' });
        res.writeHead(204, {
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type, x-file-name',
          'access-control-max-age': '600',
        });
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/')
        return send(200, REMOTE_PAGE, 'text/html; charset=utf-8');
      if (req.method === 'POST' && url.pathname === '/api/pair') {
        const body = (await readJson(req, 1024)) as { code?: unknown };
        const token = this.pair(String(body.code ?? '').trim());
        return token
          ? send(200, { token, name: this.d.status().name })
          : send(401, {
              error: this.locked
                ? 'Too many wrong codes. Make a new code on the PC.'
                : 'That code is not right.',
            });
      }
      // The phone-only app asks "is the PC on?" (it runs on GitHub Pages, so it needs CORS).
      if (url.pathname === '/api/ping') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(
          JSON.stringify({ ok: true, name: this.d.status().name, version: this.d.version?.() }),
        );
        return;
      }
      if (!url.pathname.startsWith('/api/')) return send(404, { error: 'Not found' });
      if (!this.authed(req)) return send(401, { error: 'Not paired' });

      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, this.d.status());
      if (req.method === 'POST' && url.pathname === '/api/message') {
        const body = (await readJson(req, 8 * 1024)) as { text?: unknown };
        const text = String(body.text ?? '')
          .trim()
          .slice(0, 2000);
        if (!text) return send(400, { error: 'Empty message' });
        this.d.log?.(`From phone: ${text}`);
        return send(200, { reply: await this.d.message(text) });
      }
      if (req.method === 'POST' && url.pathname === '/api/stop') {
        this.d.emergencyStop();
        this.d.log?.('Emergency stop from phone');
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/agent') {
        const body = (await readJson(req, 4 * 1024)) as { id?: unknown; answer?: unknown };
        const a = body.answer;
        this.d.agentAnswer(
          String(body.id ?? ''),
          typeof a === 'boolean' ? a : String(a ?? '').slice(0, 2000),
        );
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/approve') {
        const body = (await readJson(req, 1024)) as { id?: unknown; ok?: unknown };
        this.d.approve(String(body.id ?? ''), body.ok === true);
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/upload') {
        const name = safeUploadName(
          decodeURIComponent(String(req.headers['x-file-name'] ?? 'file')),
        );
        const len = Number(req.headers['content-length'] ?? 0);
        if (!len || len > MAX_UPLOAD) return send(413, { error: 'Files up to 200 MB.' });
        const dir = this.d.uploadDir();
        mkdirSync(dir, { recursive: true });
        let dest = join(dir, name);
        for (let i = 2; existsSync(dest); i++) {
          const ext = extname(name);
          dest = join(dir, `${name.slice(0, name.length - ext.length)} (${i})${ext}`);
        }
        await new Promise<void>((resolve, reject) => {
          let got = 0;
          const out = createWriteStream(dest);
          req.on('data', (c: Buffer) => {
            got += c.length;
            if (got > MAX_UPLOAD) req.destroy(new Error('too big'));
          });
          req.pipe(out);
          out.on('finish', () => resolve());
          out.on('error', reject);
          req.on('error', reject);
        });
        this.d.log?.(`Phone sent ${basename(dest)}`);
        return send(200, { saved: basename(dest) });
      }
      if (this.d.route) {
        const body =
          req.method === 'POST'
            ? ((await readJson(req, 16 * 1024 * 1024)) as Record<string, unknown>)
            : {};
        const r = await this.d.route(
          req.method ?? 'GET',
          url.pathname,
          body ?? {},
          url.searchParams,
        );
        if (r) {
          if ('mp3' in r) {
            res.writeHead(r.status ?? 200, {
              'content-type': 'audio/mpeg',
              'cache-control': 'no-store',
            });
            res.end(Buffer.from(r.mp3));
            return;
          }
          if ('jpeg' in r) {
            res.writeHead(r.status ?? 200, {
              'content-type': 'image/jpeg',
              'cache-control': 'no-store',
            });
            res.end(r.jpeg);
            return;
          }
          return send(r.status ?? 200, r.json);
        }
      }
      return send(404, { error: 'Not found' });
    } catch (err) {
      if (!res.headersSent) send(500, { error: err instanceof Error ? err.message : 'Failed' });
    }
  }
}

function readJson(req: IncomingMessage, max: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      body += c;
      if (body.length > max) {
        reject(new Error('Too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}
