import { createServer, type AddressInfo, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenRgbClient,
  PcLights,
  modeFor,
  packet,
  parseController,
} from '../../src/main/services/openrgb';

const u16 = (n: number): Buffer => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const i32 = (n: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
const str = (s: string): Buffer => Buffer.concat([u16(s.length + 1), Buffer.from(`${s}\0`)]);

/** A controller described the way OpenRGB sends it (protocol 3). */
function controller(name: string, type: number, modes: string[], leds: number, active = 0): Buffer {
  const mode = (m: string, i: number): Buffer =>
    Buffer.concat([str(m), i32(i), ...[0, 0, 0, 0, 100, 0, 1, 0, 100, 0, 1].map(u32), u16(0)]);
  const body = Buffer.concat([
    i32(type),
    str(name),
    str('ASUS'),
    str('desc'),
    str('1.0'),
    str(''),
    str('HID'),
    u16(modes.length),
    i32(active),
    ...modes.map(mode),
    u16(1),
    str('Main'),
    i32(0),
    u32(leds),
    u32(leds),
    u32(leds),
    u16(0),
    u16(leds),
    ...Array.from({ length: leds }, (_, i) => Buffer.concat([str(`LED ${i}`), u32(i)])),
    u16(leds),
    Buffer.alloc(leds * 4),
  ]);
  return Buffer.concat([u32(body.length + 4), body]);
}

const DEVICES = [
  controller(
    'ASUS TUF GAMING B850-PLUS WIFI',
    0,
    ['Direct', 'Off', 'Static', 'Breathing', 'Spectrum Cycle'],
    2,
    4,
  ),
  controller('Kingston Fury DDR5', 1, ['Direct', 'Static', 'Rainbow Wave'], 12, 2),
];

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

/** A fake OpenRGB SDK server: answers like the real one and records what it was sent. */
async function fakeServer(profiles: string[] = ['Evening']) {
  const got: Array<{ id: number; device: number; data: Buffer }> = [];
  server = createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 16) {
        const device = buf.readUInt32LE(4);
        const id = buf.readUInt32LE(8);
        const size = buf.readUInt32LE(12);
        if (buf.length < 16 + size) return;
        const data = buf.subarray(16, 16 + size);
        buf = buf.subarray(16 + size);
        got.push({ id, device, data: Buffer.from(data) });
        if (id === 0) s.write(packet(0, 0, u32(DEVICES.length)));
        if (id === 40) s.write(packet(40, 0, u32(4)));
        if (id === 1) s.write(packet(1, device, DEVICES[device] ?? Buffer.alloc(0)));
        if (id === 150) {
          const list = Buffer.concat([u16(profiles.length), ...profiles.map(str)]);
          s.write(packet(150, 0, Buffer.concat([u32(list.length + 4), list])));
        }
      }
    });
  });
  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  const port = (server?.address() as AddressInfo).port;
  return { got, client: () => new OpenRgbClient(port) };
}

describe('PC lights through OpenRGB', () => {
  it('reads a controller’s name, type, LEDs and effects', () => {
    const d = parseController(DEVICES[0]!, 0, 3);
    expect(d).toMatchObject({
      name: 'ASUS TUF GAMING B850-PLUS WIFI',
      type: 'Motherboard',
      leds: 2,
      activeMode: 4,
    });
    expect(d.modes).toEqual(['Direct', 'Off', 'Static', 'Breathing', 'Spectrum Cycle']);
    expect(modeFor(d.modes, 'rainbow')).toBe(4);
    expect(modeFor(d.modes, 'breathing')).toBe(3);
    expect(modeFor(d.modes, 'disco')).toBe(-1);
  });

  it('lists devices, sets a colour on one, and turns everything off', async () => {
    const f = await fakeServer();
    const lights = new PcLights({ client: f.client, rivals: async () => [] });
    expect(await lights.tool({ action: 'devices' })).toEqual({
      devices: [
        { name: 'ASUS TUF GAMING B850-PLUS WIFI', type: 'Motherboard', leds: 2 },
        { name: 'Kingston Fury DDR5', type: 'DRAM', leds: 12 },
      ],
    });
    const r = (await lights.tool({ action: 'color', color: 'purple', device: 'RAM' })) as {
      result: string;
    };
    expect(r.result).toBe('Set Kingston Fury DDR5 to #8000ff at 100% brightness.');
    const leds = f.got.filter((g) => g.id === 1050);
    expect(leds).toHaveLength(1);
    expect(leds[0]?.device).toBe(1);
    expect(leds[0]?.data.readUInt16LE(4)).toBe(12);
    expect([...leds[0]!.data.subarray(6, 10)]).toEqual([0x80, 0x00, 0xff, 0]);
    expect(f.got.some((g) => g.id === 1100 && g.device === 1)).toBe(true);

    f.got.length = 0;
    expect(await lights.tool({ action: 'off' })).toMatchObject({
      result: 'Turned off all your PC lights.',
    });
    // The motherboard has an "Off" mode; the RAM is set to black.
    expect(f.got.find((g) => g.id === 1101)?.device).toBe(0);
    expect(f.got.find((g) => g.id === 1050)?.device).toBe(1);
  });

  it('brightness dims the last colour; effects, profiles, and other lighting apps', async () => {
    const f = await fakeServer();
    const lights = new PcLights({ client: f.client, rivals: async () => ['Armoury Crate'] });
    await lights.tool({ action: 'color', color: '#ff8800', device: 'motherboard' });
    f.got.length = 0;
    const r = (await lights.tool({
      action: 'brightness',
      brightness: 50,
      device: 'motherboard',
    })) as {
      result: string;
      note: string;
    };
    expect(r.result).toBe('Set ASUS TUF GAMING B850-PLUS WIFI to #ff8800 at 50% brightness.');
    expect(r.note).toMatch(/Armoury Crate is also running/);
    expect([...f.got.find((g) => g.id === 1050)!.data.subarray(6, 9)]).toEqual([128, 68, 0]);

    f.got.length = 0;
    expect(await lights.tool({ action: 'effect', effect: 'rainbow' })).toMatchObject({
      result:
        'Effect on: ASUS TUF GAMING B850-PLUS WIFI: Spectrum Cycle; Kingston Fury DDR5: Rainbow Wave.',
    });
    const modes = f.got.filter((g) => g.id === 1101);
    expect(modes.map((m) => [m.device, m.data.readInt32LE(4)])).toEqual([
      [0, 4],
      [1, 2],
    ]);
    expect(await lights.tool({ action: 'profile', profile: 'evening' })).toEqual({
      result: 'Loaded the “Evening” lighting profile.',
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(f.got.find((g) => g.id === 152)?.data.toString()).toBe('Evening\0');
    expect(await lights.tool({ action: 'color', color: 'sparkly' })).toMatchObject({
      error: expect.stringMatching(/isn't a colour/),
    });
  });

  it('“on” puts the lights back the way they were before Alton changed them', async () => {
    const f = await fakeServer();
    const lights = new PcLights({ client: f.client, rivals: async () => [] });
    await lights.tool({ action: 'off' });
    f.got.length = 0;
    expect(await lights.tool({ action: 'on' })).toMatchObject({
      result: 'Lights back on as they were.',
    });
    expect(
      f.got.filter((g) => g.id === 1101).map((m) => [m.device, m.data.readInt32LE(4)]),
    ).toEqual([
      [0, 4],
      [1, 2],
    ]);
  });

  it('says how to start OpenRGB when it isn’t reachable', async () => {
    const lights = new PcLights({ client: () => new OpenRgbClient(1) });
    expect(await lights.tool({ action: 'off' })).toMatchObject({
      error: expect.stringMatching(/SDK Server/),
    });
  });
});
