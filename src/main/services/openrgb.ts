/** PC lighting through OpenRGB's SDK server (OpenRGB › SDK Server › Start server; it listens on
 *  127.0.0.1:6742). One controller covers most brands: ASUS Aura, Corsair, Razer, RAM, GPUs,
 *  fans… Only ever connects to this PC (localhost). Commands: list devices, set a colour or
 *  brightness, turn off, load a saved OpenRGB profile.
 *  Protocol: a 16-byte header ("ORGB", device index, packet id, data size; little-endian) and data. */
import { Socket } from 'node:net';
import {
  DEVICE_TYPES,
  atBrightness,
  matchDevices,
  parseColor,
  toHex,
  type LightDevice,
  type Rgb,
} from '@shared/lights';

export const OPENRGB_PORT = 6742;
/** The protocol version Alton speaks (3: brightness in modes; no zone segments). */
const PROTOCOL = 3;

const P = {
  COUNT: 0,
  CONTROLLER: 1,
  PROTOCOL: 40,
  CLIENT_NAME: 50,
  PROFILES: 150,
  LOAD_PROFILE: 152,
  UPDATE_LEDS: 1050,
  CUSTOM_MODE: 1100,
  UPDATE_MODE: 1101,
} as const;

export function packet(id: number, device = 0, data: Buffer = Buffer.alloc(0)): Buffer {
  const h = Buffer.alloc(16);
  h.write('ORGB', 0, 'ascii');
  h.writeUInt32LE(device, 4);
  h.writeUInt32LE(id, 8);
  h.writeUInt32LE(data.length, 12);
  return Buffer.concat([h, data]);
}

const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};

/** Reads OpenRGB's little-endian fields in order. */
class Reader {
  off = 0;
  constructor(private readonly b: Buffer) {}
  u16(): number {
    const v = this.b.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }
  u32(): number {
    const v = this.b.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  i32(): number {
    const v = this.b.readInt32LE(this.off);
    this.off += 4;
    return v;
  }
  str(): string {
    const n = this.u16();
    const s = this.b
      .subarray(this.off, this.off + n)
      .toString('utf8')
      .replace(/\0+$/, '');
    this.off += n;
    return s;
  }
  skip(n: number): void {
    this.off += n;
  }
}

/** A controller's data (protocol ≥ 3) → what Alton needs: name, type, LED count, modes. */
export type Controller = LightDevice & {
  modes: string[];
  /** Each mode exactly as the server described it (sent back to switch to it). */
  rawModes: Buffer[];
  activeMode: number;
};

export function parseController(buf: Buffer, index: number, proto = PROTOCOL): Controller {
  const r = new Reader(buf);
  r.u32(); // data size
  const type = r.i32();
  const name = r.str();
  if (proto >= 1) r.str(); // vendor
  r.str(); // description
  r.str(); // version
  r.str(); // serial
  r.str(); // location
  const numModes = r.u16();
  const activeMode = r.i32();
  const modes: string[] = [];
  const rawModes: Buffer[] = [];
  for (let i = 0; i < numModes; i++) {
    const start = r.off;
    modes.push(r.str());
    r.i32(); // value
    r.u32(); // flags
    r.u32(); // speed min
    r.u32(); // speed max
    if (proto >= 3) {
      r.u32(); // brightness min
      r.u32(); // brightness max
    }
    r.u32(); // colors min
    r.u32(); // colors max
    r.u32(); // speed
    if (proto >= 3) r.u32(); // brightness
    r.u32(); // direction
    r.u32(); // color mode
    r.skip(r.u16() * 4); // colours
    rawModes.push(Buffer.from(buf.subarray(start, r.off)));
  }
  const numZones = r.u16();
  for (let i = 0; i < numZones; i++) {
    r.str(); // name
    r.i32(); // type
    r.u32(); // leds min
    r.u32(); // leds max
    r.u32(); // leds count
    r.skip(r.u16()); // matrix (its byte length, height and width included)
    if (proto >= 4) {
      const segs = r.u16();
      for (let s = 0; s < segs; s++) {
        r.str();
        r.i32();
        r.u32();
        r.u32();
      }
    }
  }
  const numLeds = r.u16();
  return {
    index,
    name,
    type: DEVICE_TYPES[type] ?? 'Other',
    leds: numLeds,
    modes,
    rawModes,
    activeMode,
  };
}

/** An effect asked for in words → the device's mode for it (null if it has none). */
export function modeFor(modes: string[], effect: string): number {
  const e = effect.trim().toLowerCase();
  const wants: Record<string, string[]> = {
    rainbow: [
      'rainbow wave',
      'spectrum cycle',
      'rainbow',
      'color cycle',
      'colour cycle',
      'spectrum',
    ],
    cycle: ['spectrum cycle', 'color cycle', 'colour cycle', 'rainbow'],
    breathing: ['breathing', 'breathe', 'pulse'],
    pulse: ['breathing', 'pulse'],
    flashing: ['flashing', 'flash', 'strobe', 'blink'],
    static: ['static', 'direct'],
    wave: ['rainbow wave', 'wave'],
  };
  const list = wants[e] ?? [e];
  const lower = modes.map((m) => m.toLowerCase());
  for (const w of list) {
    const i = lower.findIndex((m) => m === w);
    if (i >= 0) return i;
  }
  for (const w of list) {
    const i = lower.findIndex((m) => m.includes(w));
    if (i >= 0) return i;
  }
  return -1;
}

/** One request/response conversation with the server. */
export class OpenRgbClient {
  private sock: Socket | null = null;
  private buf = Buffer.alloc(0);
  private waiters: Array<{ id: number; resolve: (b: Buffer) => void }> = [];
  private proto = 0;

  constructor(
    private readonly port = OPENRGB_PORT,
    private readonly host = '127.0.0.1',
  ) {}

  async connect(timeoutMs = 2500): Promise<void> {
    if (this.sock) return;
    const s = new Socket();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        s.destroy();
        reject(new Error('timeout'));
      }, timeoutMs);
      s.once('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
      s.connect(this.port, this.host, () => {
        clearTimeout(t);
        resolve();
      });
    });
    s.on('data', (d: Buffer) => this.feed(d));
    s.on('error', () => this.close());
    s.on('close', () => {
      this.sock = null;
    });
    this.sock = s;
    this.send(P.CLIENT_NAME, 0, Buffer.from('Alton\0', 'utf8'));
    const v = await this.request(P.PROTOCOL, 0, u32(PROTOCOL)).catch(() => null);
    // Old servers don't answer the version request: protocol 0.
    this.proto = v && v.length >= 4 ? Math.min(PROTOCOL, v.readUInt32LE(0)) : 0;
  }

  private feed(d: Buffer): void {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 16) {
      if (this.buf.subarray(0, 4).toString('ascii') !== 'ORGB') {
        this.buf = Buffer.alloc(0);
        return;
      }
      const id = this.buf.readUInt32LE(8);
      const size = this.buf.readUInt32LE(12);
      if (this.buf.length < 16 + size) return;
      const data = this.buf.subarray(16, 16 + size);
      this.buf = this.buf.subarray(16 + size);
      const i = this.waiters.findIndex((w) => w.id === id);
      if (i >= 0) this.waiters.splice(i, 1)[0]?.resolve(Buffer.from(data));
    }
  }

  private send(id: number, device = 0, data?: Buffer): void {
    this.sock?.write(packet(id, device, data));
  }

  private request(id: number, device = 0, data?: Buffer, timeoutMs = 3000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const w = { id, resolve };
      this.waiters.push(w);
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error('OpenRGB did not answer'));
      }, timeoutMs);
      w.resolve = (b) => {
        clearTimeout(t);
        resolve(b);
      };
      this.send(id, device, data);
    });
  }

  async devices(): Promise<Controller[]> {
    const count = (await this.request(P.COUNT)).readUInt32LE(0);
    const out: Controller[] = [];
    for (let i = 0; i < Math.min(count, 64); i++) {
      const data = await this.request(P.CONTROLLER, i, this.proto ? u32(this.proto) : undefined);
      try {
        out.push(parseController(data, i, this.proto));
      } catch {
        /* a device Alton can't read: skipped */
      }
    }
    return out;
  }

  /** Every LED of a device to one colour (switches it to its direct/custom mode first). */
  setColor(d: LightDevice, c: Rgb): void {
    this.send(P.CUSTOM_MODE, d.index);
    const n = Math.min(d.leds, 0xffff);
    const body = Buffer.alloc(4 + 2 + n * 4);
    body.writeUInt32LE(body.length, 0);
    body.writeUInt16LE(n, 4);
    for (let i = 0; i < n; i++) {
      body[6 + i * 4] = c.r;
      body[7 + i * 4] = c.g;
      body[8 + i * 4] = c.b;
    }
    this.send(P.UPDATE_LEDS, d.index, body);
  }

  /** Switch a device to one of its own modes (effects), with the settings it already has. */
  setMode(d: Controller, mode: number): void {
    const raw = d.rawModes[mode];
    if (!raw) return;
    const body = Buffer.alloc(8 + raw.length);
    body.writeUInt32LE(body.length, 0);
    body.writeInt32LE(mode, 4);
    raw.copy(body, 8);
    this.send(P.UPDATE_MODE, d.index, body);
  }

  async profiles(): Promise<string[]> {
    if (this.proto < 2) return [];
    const r = new Reader(await this.request(P.PROFILES));
    r.u32(); // data size
    const n = r.u16();
    return Array.from({ length: n }, () => r.str());
  }

  loadProfile(name: string): void {
    this.send(P.LOAD_PROFILE, 0, Buffer.from(`${name}\0`, 'utf8'));
  }

  /** Finish sending anything still queued, then close (destroying straight away can drop the
   *  last command). */
  close(): void {
    const s = this.sock;
    this.sock = null;
    if (!s) return;
    s.end();
    setTimeout(() => s.destroy(), 1000).unref?.();
  }
}

/** The pc_lights tool: on, off, colour, brightness, devices, profiles. */
export class PcLights {
  /** Last colour and brightness set (for "on" and "brighter"). */
  private last: { color: Rgb; brightness: number } | null = null;
  /** Each device's effect before Alton first changed it (for "on" / "back to normal"). */
  private before = new Map<string, number>();

  constructor(
    private readonly d: {
      client?: () => OpenRgbClient;
      /** Armoury Crate / iCUE / Synapse running: they may take the lights back. */
      rivals?: () => Promise<string[]>;
    } = {},
  ) {}

  private notRunning(): { error: string } {
    return {
      error:
        "Alton couldn't reach OpenRGB. Open OpenRGB, go to the SDK Server tab and press Start Server (tick “Start at login” and the server option in its settings so it's always on).",
    };
  }

  async tool(raw: unknown): Promise<unknown> {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const action = typeof o.action === 'string' ? o.action : 'devices';
    const target = typeof o.device === 'string' ? o.device : '';
    const c = this.d.client?.() ?? new OpenRgbClient();
    try {
      await c.connect();
    } catch {
      return this.notRunning();
    }
    try {
      const all = await c.devices();
      if (!all.length)
        return {
          error:
            'OpenRGB is running but found no lighting devices. Open OpenRGB once and let it scan (it may need running as administrator the first time).',
        };
      if (action === 'devices')
        return { devices: all.map((d) => ({ name: d.name, type: d.type, leds: d.leds })) };
      if (action === 'profiles') return { profiles: await c.profiles() };
      if (action === 'profile') {
        const want = typeof o.profile === 'string' ? o.profile.trim().toLowerCase() : '';
        const list = await c.profiles();
        const p =
          list.find((x) => x.toLowerCase() === want) ??
          list.find((x) => x.toLowerCase().includes(want));
        if (!p)
          return {
            error: `No OpenRGB profile called “${String(o.profile ?? '')}”.`,
            profiles: list,
          };
        c.loadProfile(p);
        return { result: `Loaded the “${p}” lighting profile.` };
      }
      const devs = matchDevices(all, target);
      if (!devs.length)
        return {
          error: `No light matches “${target}”.`,
          devices: all.map((d) => `${d.name} (${d.type})`),
        };
      for (const d of devs)
        if (!this.before.has(d.name) && d.modes[d.activeMode]?.toLowerCase() !== 'off')
          this.before.set(d.name, d.activeMode);
      let color = this.last?.color ?? { r: 255, g: 255, b: 255 };
      let brightness = this.last?.brightness ?? 100;
      let said = '';
      if (action === 'off') {
        for (const d of devs) {
          const off = d.modes.findIndex((m) => m.toLowerCase() === 'off');
          if (off >= 0) c.setMode(d, off);
          else c.setColor(d, { r: 0, g: 0, b: 0 });
        }
      } else if (action === 'effect') {
        const effect = String(o.effect ?? 'rainbow');
        const done: string[] = [];
        const none: string[] = [];
        for (const d of devs) {
          const m = modeFor(d.modes, effect);
          if (m < 0) none.push(d.name);
          else {
            c.setMode(d, m);
            done.push(`${d.name}: ${d.modes[m]}`);
          }
        }
        if (!done.length)
          return {
            error: `None of these lights has a “${effect}” effect.`,
            effects: [...new Set(devs.flatMap((d) => d.modes))],
          };
        said = `Effect on: ${done.join('; ')}${none.length ? ` (no such effect on ${none.join(', ')})` : ''}.`;
      } else if (action === 'on' && !this.last && typeof o.brightness !== 'number') {
        // Back to how they were before Alton changed them (or their own colour mode).
        for (const d of devs) {
          const m =
            this.before.get(d.name) ?? d.modes.findIndex((x) => /^(static|direct)$/i.test(x));
          if (m >= 0 && d.modes[m]?.toLowerCase() !== 'off') c.setMode(d, m);
          else c.setColor(d, color);
        }
        said = 'Lights back on as they were.';
      } else {
        if (action === 'color') {
          const parsed = parseColor(String(o.color ?? ''));
          if (!parsed)
            return {
              error: `“${String(o.color ?? '')}” isn't a colour Alton knows. Try a name like “purple” or a hex code like #ff8800.`,
            };
          color = parsed;
        }
        if (typeof o.brightness === 'number') brightness = Math.max(1, Math.min(100, o.brightness));
        else if (action === 'on' && brightness < 5) brightness = 100;
        for (const d of devs) c.setColor(d, atBrightness(color, brightness));
        this.last = { color, brightness };
      }
      // Give the server a moment to send the updates before the connection closes.
      await new Promise((r) => setTimeout(r, 150));
      const which =
        devs.length === all.length ? 'all your PC lights' : devs.map((d) => d.name).join(', ');
      const rivals = (await this.d.rivals?.().catch(() => [])) ?? [];
      return {
        result:
          said ||
          (action === 'off'
            ? `Turned off ${which}.`
            : `Set ${which} to ${toHex(color)} at ${brightness}% brightness.`),
        ...(rivals.length
          ? {
              note: `${rivals.join(' and ')} ${rivals.length === 1 ? 'is' : 'are'} also running and may change some lights back. If that happens, turn off its lighting control (or close it).`,
            }
          : {}),
      };
    } catch (err) {
      return {
        error: `The lights didn't change: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      c.close();
    }
  }
}
