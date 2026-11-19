import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RemoteServer,
  isPrivateAddress,
  safeUploadName,
} from '../../src/main/services/remote-server';

const status = () => ({
  name: 'Alton',
  pc: { cpu: 12, memPct: 40, cpuTemp: 50, uptimeHours: 3 },
  playing: null,
  gaming: null,
  agent: { state: 'idle', task: '', last: '', question: null },
  notices: [],
  approvals: [],
  history: [],
});

let srv: RemoteServer | null = null;
afterEach(() => srv?.stop());

describe('phone companion helpers', () => {
  it('only treats home-network addresses as private', () => {
    for (const a of [
      '192.168.1.5',
      '10.0.0.2',
      '172.20.1.1',
      '::ffff:192.168.0.9',
      '127.0.0.1',
      'fe80::1',
    ])
      expect(isPrivateAddress(a)).toBe(true);
    for (const a of ['8.8.8.8', '172.32.0.1', '::ffff:1.2.3.4', undefined])
      expect(isPrivateAddress(a)).toBe(false);
  });
  it('makes upload names safe', () => {
    expect(safeUploadName('../../evil.txt')).toBe('evil.txt');
    expect(safeUploadName('C:\\\\Windows\\\\x.jpg')).toBe('x.jpg');
    expect(safeUploadName('setup.exe')).toBe('setup.exe.download');
    expect(safeUploadName('..')).toBe('file');
  });
});

describe('RemoteServer', () => {
  it('answers "is the PC on?" for the phone app only, without pairing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-remote-'));
    srv = new RemoteServer({
      status,
      message: vi.fn(async () => ''),
      emergencyStop: vi.fn(),
      agentAnswer: vi.fn(),
      approve: vi.fn(),
      uploadDir: () => join(dir, 'up'),
      file: join(dir, 'paired.json'),
      pingOrigin: () => 'https://palpa1n3.github.io',
    });
    await srv.start(0);
    const r = await fetch(`http://127.0.0.1:${srv.port()}/api/ping`);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe('https://palpa1n3.github.io');
    expect(r.headers.get('access-control-allow-private-network')).toBe('true');
    expect(await r.json()).toMatchObject({ ok: true });
    // Everything else still needs pairing.
    expect((await fetch(`http://127.0.0.1:${srv.port()}/api/status`)).status).toBe(401);
    await srv.stop();
  });

  it('pairs with the code once, locks after wrong guesses, and serves paired phones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-remote-'));
    const message = vi.fn(async (t: string) => `You said ${t}`);
    const stop = vi.fn();
    srv = new RemoteServer({
      status,
      message,
      emergencyStop: stop,
      agentAnswer: vi.fn(),
      approve: vi.fn(),
      uploadDir: () => join(dir, 'From phone'),
      file: join(dir, 'paired.json'),
    });
    await srv.start(0);
    const base = `http://127.0.0.1:${srv.port()}`;
    const code = srv.pairingCode();
    expect(code).toMatch(/^\d{6}$/);

    expect((await fetch(`${base}/`)).headers.get('content-type')).toMatch(/html/);
    expect((await fetch(`${base}/api/status`)).status).toBe(401);
    const bad = await fetch(`${base}/api/pair`, {
      method: 'POST',
      body: JSON.stringify({ code: '000000' === code ? '111111' : '000000' }),
    });
    expect(bad.status).toBe(401);
    const ok = (await (
      await fetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ code }) })
    ).json()) as { token: string };
    expect(ok.token).toMatch(/^[a-f0-9]{64}$/);
    expect(srv.pairingCode()).not.toBe(code); // single use
    expect(readFileSync(join(dir, 'paired.json'), 'utf8')).not.toContain(ok.token); // only a hash is stored

    const auth = { authorization: `Bearer ${ok.token}` };
    expect(
      ((await (await fetch(`${base}/api/status`, { headers: auth })).json()) as { name: string })
        .name,
    ).toBe('Alton');
    const r = (await (
      await fetch(`${base}/api/message`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: 'hi' }),
      })
    ).json()) as { reply: string };
    expect(r.reply).toBe('You said hi');
    await fetch(`${base}/api/stop`, { method: 'POST', headers: auth });
    expect(stop).toHaveBeenCalled();
    const up = (await (
      await fetch(`${base}/api/upload`, {
        method: 'POST',
        headers: { ...auth, 'x-file-name': encodeURIComponent('photo.jpg') },
        body: 'abc',
      })
    ).json()) as { saved: string };
    expect(up.saved).toBe('photo.jpg');
    expect(readFileSync(join(dir, 'From phone', 'photo.jpg'), 'utf8')).toBe('abc');

    srv.forgetAll();
    expect((await fetch(`${base}/api/status`, { headers: auth })).status).toBe(401);
  });

  it('rate-limits code guesses', () => {
    srv = new RemoteServer({
      status,
      message: async () => '',
      emergencyStop: vi.fn(),
      agentAnswer: vi.fn(),
      approve: vi.fn(),
      uploadDir: () => tmpdir(),
    });
    srv.newCode();
    const real = srv.pairingCode();
    const wrong = real === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) expect(srv.pair(wrong, 1000)).toBeNull();
    expect(srv.pair(real, 2000)).toBeNull(); // locked for a minute
    expect(srv.pair(real, 70_000)).toMatch(/^[a-f0-9]{64}$/);
  });
});
