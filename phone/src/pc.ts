/** Talking to the PC's Alton straight from the phone app (over Tailscale HTTPS).
 *  The PC only answers this app's own site (CORS) and only on private/Tailscale addresses;
 *  the pairing token lives on this phone only. */

export interface PcConn {
  base: string;
  token: string;
}

export class PcError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Tailscale HTTPS names only (the app's security policy allows nothing else). */
export const isPcAddress = (s: string): boolean => /^https:\/\/[\w.-]+\.ts\.net(:\d+)?$/.test(s);

const timeout = (ms: number): AbortSignal | undefined => {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined; // older browsers: no timeout
  }
};

export async function pcApi<T>(
  c: PcConn,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  ms = 15_000,
): Promise<T> {
  const r = await fetch(`${c.base}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${c.token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: timeout(ms),
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new PcError(j.error || `The PC said ${r.status}`, r.status);
  return j as T;
}

/** Swap the 6-digit code shown on the PC for this phone's own token. */
export async function pairWithPc(
  base: string,
  code: string,
): Promise<{ token: string; name: string }> {
  const r = await fetch(`${base}/api/pair`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: timeout(10_000),
  });
  const j = (await r.json().catch(() => ({}))) as { token?: string; name?: string; error?: string };
  if (!r.ok || !j.token) throw new PcError(j.error || 'That code didn’t work.', r.status);
  return { token: j.token, name: j.name ?? 'PC' };
}

export async function pcScreen(c: PcConn): Promise<Blob> {
  const r = await fetch(`${c.base}/api/screen`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${c.token}` },
    signal: timeout(20_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new PcError(j.error || 'Couldn’t see the screen.', r.status);
  }
  return r.blob();
}

export async function pcUpload(c: PcConn, file: File): Promise<string> {
  const r = await fetch(`${c.base}/api/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.token}`,
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const j = (await r.json().catch(() => ({}))) as { saved?: string; error?: string };
  if (!r.ok) throw new PcError(j.error || 'Upload failed.', r.status);
  return j.saved ?? file.name;
}

/** What the PC says about itself (GET /api/status). */
export interface PcStatus {
  name: string;
  pc: {
    cpu: number | null;
    memPct: number | null;
    cpuTemp: number | null;
    uptimeHours?: number | null;
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
}

export interface PcJob {
  id: string;
  chatId: string;
  text: string;
  activity: string;
  done: boolean;
  error?: string;
  sources?: Array<{ url: string; title: string }>;
}

/** A quick live frame of the PC's screen (remote control). */
export async function pcLive(c: PcConn, screen?: number): Promise<Blob> {
  const r = await fetch(`${c.base}/api/live?t=${Date.now()}${screen ? `&screen=${screen}` : ''}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${c.token}` },
    signal: timeout(10_000),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new PcError(j.error || 'Couldn’t see the screen.', r.status);
  }
  return r.blob();
}

/** Mouse and keyboard on the PC (positions are 0–1 of its screen). */
export function pcInput(c: PcConn, cmd: Record<string, unknown>): Promise<unknown> {
  return pcApi(c, 'POST', '/api/input', cmd, 8000);
}
