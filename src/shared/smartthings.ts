/** Smart home through Samsung SmartThings (api.smartthings.com, a personal access token).
 *  Shared by the PC (token encrypted in main) and the phone app (token on the phone only).
 *  The HTTP call is passed in, so this file stays pure and testable. Unlocking a lock or
 *  opening a door/garage always asks first. */

export const ST_API = 'https://api.smartthings.com/v1';

export type StFetch = (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<{ status: number; json: unknown }>;

export interface StDevice {
  id: string;
  name: string;
  room: string;
  caps: string[];
}

export interface StScene {
  id: string;
  name: string;
}

export const SMART_ACTIONS = [
  'list',
  'status',
  'on',
  'off',
  'set_level',
  'set_temperature',
  'lock',
  'unlock',
  'open',
  'close',
  'scene',
] as const;
export type SmartAction = (typeof SMART_ACTIONS)[number];

export interface SmartInput {
  action: SmartAction;
  device?: string;
  value?: number;
}

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

export function cleanSmartInput(raw: unknown): SmartInput | null {
  const o = obj(raw);
  const action = String(o.action ?? '') as SmartAction;
  if (!SMART_ACTIONS.includes(action)) return null;
  const device = typeof o.device === 'string' ? o.device.trim().slice(0, 80) : undefined;
  const value = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : undefined;
  return { action, ...(device ? { device } : {}), ...(value !== undefined ? { value } : {}) };
}

/** Devices from GET /devices (rooms from GET /rooms, optional). */
export function parseDevices(json: unknown, rooms: Record<string, string> = {}): StDevice[] {
  return arr(obj(json).items)
    .map((d) => {
      const x = obj(d);
      const caps = arr(obj(arr(x.components)[0]).capabilities)
        .map((c) => String(obj(c).id ?? ''))
        .filter(Boolean);
      return {
        id: String(x.deviceId ?? ''),
        name: String(x.label || x.name || '').trim(),
        room: rooms[String(x.roomId ?? '')] ?? '',
        caps,
      };
    })
    .filter((d) => d.id && d.name);
}

export function parseScenes(json: unknown): StScene[] {
  return arr(obj(json).items)
    .map((s) => ({ id: String(obj(s).sceneId ?? ''), name: String(obj(s).sceneName ?? '').trim() }))
    .filter((s) => s.id && s.name);
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\b(the|my)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The best match for a spoken name ("living room lamp", "tv"), checking room + name too. */
export function matchByName<T extends { name: string; room?: string }>(
  list: T[],
  name: string,
): T | null {
  const q = norm(name);
  if (!q) return null;
  const full = (x: T): string => norm(`${x.room ?? ''} ${x.name}`);
  return (
    list.find((x) => norm(x.name) === q) ??
    list.find((x) => full(x) === q) ??
    list.find((x) => norm(x.name).includes(q) || q.includes(norm(x.name))) ??
    list.find((x) => q.split(' ').every((w) => full(x).includes(w))) ??
    null
  );
}

export interface StCommand {
  capability: string;
  command: string;
  arguments?: unknown[];
}

/** The SmartThings command for an action on a device, or a reason it can't. */
export function commandFor(d: StDevice, a: SmartAction, value?: number): StCommand | string {
  const has = (c: string): boolean => d.caps.includes(c);
  switch (a) {
    case 'on':
    case 'off':
      return has('switch')
        ? { capability: 'switch', command: a }
        : `${d.name} can't be switched ${a}.`;
    case 'set_level': {
      if (value === undefined) return 'Say what level (0–100).';
      const v = Math.round(Math.min(100, Math.max(0, value)));
      if (has('switchLevel'))
        return { capability: 'switchLevel', command: 'setLevel', arguments: [v] };
      if (has('audioVolume'))
        return { capability: 'audioVolume', command: 'setVolume', arguments: [v] };
      if (has('windowShadeLevel'))
        return { capability: 'windowShadeLevel', command: 'setShadeLevel', arguments: [v] };
      return `${d.name} has no brightness or volume to set.`;
    }
    case 'set_temperature': {
      if (value === undefined) return 'Say what temperature.';
      const v = Math.min(30, Math.max(5, value));
      if (has('thermostatHeatingSetpoint'))
        return {
          capability: 'thermostatHeatingSetpoint',
          command: 'setHeatingSetpoint',
          arguments: [v],
        };
      if (has('thermostatCoolingSetpoint'))
        return {
          capability: 'thermostatCoolingSetpoint',
          command: 'setCoolingSetpoint',
          arguments: [v],
        };
      return `${d.name} isn't a thermostat.`;
    }
    case 'lock':
    case 'unlock':
      return has('lock') ? { capability: 'lock', command: a } : `${d.name} isn't a lock.`;
    case 'open':
    case 'close':
      if (has('doorControl')) return { capability: 'doorControl', command: a };
      if (has('windowShade')) return { capability: 'windowShade', command: a };
      if (has('valve')) return { capability: 'valve', command: a };
      return `${d.name} can't be opened or closed.`;
    default:
      return 'Not a device command.';
  }
}

/** Unlocking or opening a door, garage or valve is never done without the user saying yes. */
export const needsConfirm = (d: StDevice, a: SmartAction): boolean =>
  a === 'unlock' || (a === 'open' && (d.caps.includes('doorControl') || d.caps.includes('valve')));

/** "on, 60%, 21.5°C, battery 80%" from GET /devices/{id}/status. */
export function describeStatus(json: unknown): string {
  const m = obj(obj(obj(json).components).main);
  const v = (cap: string, attr: string): unknown => obj(obj(m[cap])[attr]).value;
  const out: string[] = [];
  const sw = v('switch', 'switch');
  if (typeof sw === 'string') out.push(sw);
  const lvl = v('switchLevel', 'level');
  if (typeof lvl === 'number') out.push(`${lvl}%`);
  const vol = v('audioVolume', 'volume');
  if (typeof vol === 'number') out.push(`volume ${vol}`);
  const tmp = v('temperatureMeasurement', 'temperature');
  if (typeof tmp === 'number') out.push(`${tmp}°`);
  const set = v('thermostatHeatingSetpoint', 'heatingSetpoint');
  if (typeof set === 'number') out.push(`set to ${set}°`);
  const lock = v('lock', 'lock');
  if (typeof lock === 'string') out.push(lock);
  for (const [cap, attr] of [
    ['doorControl', 'door'],
    ['windowShade', 'windowShade'],
    ['contactSensor', 'contact'],
    ['motionSensor', 'motion'],
  ] as const) {
    const x = v(cap, attr);
    if (typeof x === 'string') out.push(x);
  }
  const bat = v('battery', 'battery');
  if (typeof bat === 'number') out.push(`battery ${bat}%`);
  return out.join(', ') || 'no readings';
}

const errorText = (status: number): string =>
  status === 401 || status === 403
    ? 'SmartThings refused the token (it may have expired: make a new one at account.smartthings.com/tokens).'
    : `SmartThings said ${status}.`;

/** Run one smart-home request. `confirm` is asked before unlocking/opening. */
export async function smartHome(
  f: StFetch,
  input: SmartInput,
  confirm: (question: string) => Promise<boolean>,
): Promise<string> {
  if (input.action === 'scene') {
    const r = await f('GET', '/scenes');
    if (r.status !== 200) return errorText(r.status);
    const scenes = parseScenes(r.json);
    if (!input.device)
      return scenes.length
        ? `Scenes: ${scenes.map((s) => s.name).join(', ')}`
        : 'No scenes set up.';
    const s = matchByName(scenes, input.device);
    if (!s)
      return `No scene called “${input.device}”. Scenes: ${scenes.map((x) => x.name).join(', ') || 'none'}.`;
    const x = await f('POST', `/scenes/${encodeURIComponent(s.id)}/execute`);
    return x.status < 300 ? `Ran the “${s.name}” scene.` : errorText(x.status);
  }
  const [dr, rr] = await Promise.all([f('GET', '/devices'), f('GET', '/locations')]);
  if (dr.status !== 200) return errorText(dr.status);
  // Rooms are per location; fetch them for the first few locations (most homes have one).
  const rooms: Record<string, string> = {};
  if (rr.status === 200)
    for (const loc of arr(obj(rr.json).items).slice(0, 3)) {
      const id = String(obj(loc).locationId ?? '');
      if (!id) continue;
      const r = await f('GET', `/locations/${encodeURIComponent(id)}/rooms`);
      if (r.status === 200)
        for (const room of arr(obj(r.json).items))
          rooms[String(obj(room).roomId ?? '')] = String(obj(room).name ?? '');
    }
  const devices = parseDevices(dr.json, rooms);
  if (input.action === 'list')
    return devices.length
      ? devices.map((d) => `${d.name}${d.room ? ` (${d.room})` : ''}`).join('\n')
      : 'No SmartThings devices found.';
  if (!input.device) return 'Say which device.';
  const d = matchByName(devices, input.device);
  if (!d)
    return `No device called “${input.device}”. Devices: ${devices.map((x) => x.name).join(', ') || 'none'}.`;
  if (input.action === 'status') {
    const r = await f('GET', `/devices/${encodeURIComponent(d.id)}/status`);
    return r.status === 200 ? `${d.name}: ${describeStatus(r.json)}` : errorText(r.status);
  }
  const c = commandFor(d, input.action, input.value);
  if (typeof c === 'string') return c;
  if (
    needsConfirm(d, input.action) &&
    !(await confirm(`${input.action === 'unlock' ? 'Unlock' : 'Open'} ${d.name}?`))
  )
    return `The user said no; ${d.name} was left as it was.`;
  const r = await f('POST', `/devices/${encodeURIComponent(d.id)}/commands`, {
    commands: [{ component: 'main', ...c }],
  });
  if (r.status >= 300) return errorText(r.status);
  const what =
    input.action === 'set_level' || input.action === 'set_temperature'
      ? `set to ${c.arguments?.[0]}`
      : input.action === 'on' || input.action === 'off'
        ? `switched ${input.action}`
        : `${input.action === 'open' ? 'opened' : input.action === 'close' ? 'closed' : `${input.action}ed`}`;
  return `${d.name} ${what}.`;
}

/** The tool description both apps give Claude. */
export const SMART_HOME_TOOL = {
  name: 'smart_home',
  description:
    'Control the user\'s smart home through Samsung SmartThings: lights, plugs, TV, heating, locks, blinds, garage, and scenes. action "list" lists devices; "status" reads one; "on"/"off"; "set_level" (brightness/volume/blind %, value 0–100); "set_temperature" (value °C); "lock"/"unlock"; "open"/"close"; "scene" runs a scene by name (no device = list scenes). Unlocking or opening a door asks the user first. Use the device name as the user says it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: { type: 'string', enum: [...SMART_ACTIONS] },
      device: { type: 'string', description: 'Device or scene name' },
      value: { type: 'number' },
    },
    required: ['action'],
    additionalProperties: false,
  },
};
