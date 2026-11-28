/** Agent Mode: Alton operates the PC (screen, mouse, keyboard) to finish a task.
 *  Shared bits: status, trigger phrases, key names → Windows virtual-key codes, safety checks. */
import { similarity } from './memory-tidy';

export type AgentState = 'idle' | 'running' | 'paused' | 'waiting' | 'done' | 'stopped' | 'error';

export interface AgentQuestion {
  id: string;
  /** ask: needs a typed/spoken answer. confirm: Approve / Deny a risky step. */
  kind: 'ask' | 'confirm';
  text: string;
}

export interface AgentLogItem {
  at: number;
  text: string;
}

export interface AgentStatus {
  state: AgentState;
  task: string;
  step: number;
  maxSteps: number;
  /** Last thing Alton said it was doing. */
  last: string;
  question: AgentQuestion | null;
  /** Final summary or error message. */
  result: string;
  log: AgentLogItem[];
  startedAt: number;
}

export const IDLE_AGENT: AgentStatus = {
  state: 'idle',
  task: '',
  step: 0,
  maxSteps: 0,
  last: '',
  question: null,
  result: '',
  log: [],
  startedAt: 0,
};

export const agentBusy = (s: AgentStatus): boolean =>
  s.state === 'running' || s.state === 'waiting' || s.state === 'paused';

/** Most model turns in one run, and most individual mouse/keyboard actions. */
export const AGENT_MAX_TURNS = 40;
export const AGENT_MAX_ACTIONS = 120;

/** Used when the user just says "handle this for me" without saying what. */
export const SCREEN_TASK =
  'Look at what is on my screen right now, work out what I am in the middle of, and finish it for me. If it is not clear what I want, ask me.';

const TRIGGERS: RegExp[] = [
  /^(?:please\s+)?(?:can you\s+|could you\s+)?handle (?:this|it|that)(?: for me)?(?:\s*(?:[:,\-–]|and|by|to)\s*(.*))?$/i,
  /^(?:please\s+)?(?:can you\s+|could you\s+)?take (?:over|control)(?: (?:of )?(?:my |the )?(?:pc|computer|mouse))?(?:\s*(?:[:,\-–]|and|to)\s*(.*))?$/i,
  /^agent(?: mode)?(?: on)?\s*(?:[:,\-–]\s*|\s)(.+)$/i,
  /^(?:start |turn on |enable )?agent mode(?: on)?$/i,
  /^do (?:this|it) for me(?:\s*(?:[:,\-–]|and)\s*(.*))?$/i,
];

/** "handle this for me: book a table" → "book a table"; "handle this for me" → SCREEN_TASK.
 *  Returns null when the text isn't an Agent Mode request. Leading wake name is already gone. */
export function parseAgentRequest(text: string): string | null {
  const t = text
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');
  for (const re of TRIGGERS) {
    const m = re.exec(t);
    if (m) {
      const rest = (m[1] ?? '').trim();
      return rest.length >= 3 ? rest : SCREEN_TASK;
    }
  }
  return null;
}

// ── keys ─────────────────────────────────────────────────────────────────────

/** xdotool-style key names (what the model sends) → Windows virtual-key codes. */
const NAMED: Record<string, number> = {
  return: 0x0d,
  enter: 0x0d,
  kp_enter: 0x0d,
  tab: 0x09,
  space: 0x20,
  backspace: 0x08,
  escape: 0x1b,
  esc: 0x1b,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  page_up: 0x21,
  pageup: 0x21,
  prior: 0x21,
  page_down: 0x22,
  pagedown: 0x22,
  next: 0x22,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  ctrl: 0x11,
  control: 0x11,
  control_l: 0x11,
  control_r: 0x11,
  shift: 0x10,
  shift_l: 0x10,
  shift_r: 0x10,
  alt: 0x12,
  alt_l: 0x12,
  alt_r: 0x12,
  super: 0x5b,
  super_l: 0x5b,
  win: 0x5b,
  meta: 0x5b,
  cmd: 0x5b,
  menu: 0x5d,
  caps_lock: 0x14,
  print: 0x2c,
  printscreen: 0x2c,
  pause: 0x13,
  num_lock: 0x90,
  scroll_lock: 0x91,
  minus: 0xbd,
  equal: 0xbb,
  plus: 0xbb,
  comma: 0xbc,
  period: 0xbe,
  slash: 0xbf,
  semicolon: 0xba,
  apostrophe: 0xde,
  grave: 0xc0,
  bracketleft: 0xdb,
  bracketright: 0xdd,
  backslash: 0xdc,
  xf86audioplay: 0xb3,
  xf86audionext: 0xb0,
  xf86audioprev: 0xb1,
  xf86audiomute: 0xad,
  xf86audioraisevolume: 0xaf,
  xf86audiolowervolume: 0xae,
};

const PUNCT: Record<string, number> = {
  '-': 0xbd,
  '=': 0xbb,
  ',': 0xbc,
  '.': 0xbe,
  '/': 0xbf,
  ';': 0xba,
  "'": 0xde,
  '`': 0xc0,
  '[': 0xdb,
  ']': 0xdd,
  '\\': 0xdc,
};

/** Keys that need the "extended" flag when pressed with keybd_event. */
export const EXTENDED_VK = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5b, 0x5d, 0x2c,
]);

export function keyCode(name: string): number | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (n in NAMED) return NAMED[n] ?? null;
  if (n.length === 1) {
    if (/[a-z]/.test(n)) return n.toUpperCase().charCodeAt(0);
    if (/[0-9]/.test(n)) return n.charCodeAt(0);
    return PUNCT[n] ?? null;
  }
  const f = /^f([1-9]|1[0-9]|2[0-4])$/.exec(n);
  if (f) return 0x6f + Number(f[1]);
  const kp = /^kp_([0-9])$/.exec(n);
  if (kp) return 0x60 + Number(kp[1]);
  return null;
}

/** "ctrl+shift+s" → [0x11, 0x10, 0x53] (press in order, release in reverse). */
export function parseCombo(combo: string): number[] | null {
  // "ctrl++" means ctrl and plus.
  const names = combo.replace(/\+\+$/, '+plus').split('+').filter(Boolean);
  if (!names.length) return null;
  const codes = names.map(keyCode);
  return codes.every((c): c is number => c !== null) ? codes : null;
}

/** The keys Agent Mode will never press, whatever the model says. */
export function blockedCombo(codes: number[]): string | null {
  const has = (vk: number): boolean => codes.includes(vk);
  if (has(0x11) && has(0x12) && has(0x2e)) return 'Ctrl+Alt+Delete';
  if (has(0x5b) && codes.includes(0x4c)) return 'Win+L (locks the PC)';
  return null;
}

// ── safety ───────────────────────────────────────────────────────────────────

/** A run of 13-19 digits (spaces/dashes allowed) that passes the Luhn check. */
export function looksLikeCardNumber(text: string): boolean {
  const runs = text.match(/(?:\d[ -]?){13,19}/g) ?? [];
  return runs.some((r) => {
    const d = r.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) return false;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      let n = Number(d[d.length - 1 - i]);
      if (i % 2 === 1) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
    }
    return sum % 10 === 0;
  });
}

/** Map a point on the (scaled) screenshot to real screen pixels. */
export function toScreen(
  x: number,
  y: number,
  shot: { width: number; height: number },
  screen: { width: number; height: number },
): { x: number; y: number } {
  const cx = Math.min(Math.max(x, 0), shot.width - 1);
  const cy = Math.min(Math.max(y, 0), shot.height - 1);
  return {
    x: Math.round((cx * screen.width) / shot.width),
    y: Math.round((cy * screen.height) / shot.height),
  };
}

/** Screenshot size: fit 1280×800, keeping the screen's shape. */
export function shotSize(screen: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const s = Math.min(1, 1280 / screen.width, 800 / screen.height);
  return { width: Math.round(screen.width * s), height: Math.round(screen.height * s) };
}

/** An Agent Mode task saved as it runs (userData/agent-task.json), so it can be picked up after
 *  Alton or the PC restarts. */
export interface SavedAgentTask {
  task: string;
  step: number;
  log: AgentLogItem[];
  startedAt: number;
  savedAt: number;
  /** Irreversible steps (approved risky steps, presses of Send / Pay / Delete… buttons), saved
   *  before each one happens ("started") and after ("done"), so a resumed task never repeats them. */
  irreversible?: IrreversibleStep[];
}

export interface IrreversibleStep {
  /** The step, as approved (confirm_action) or "Pressed “Send”". */
  text: string;
  /** The button's label, for presses. */
  button?: string;
  at: number;
  /** started: about to happen when the task was cut off (may or may not have happened). */
  state: 'started' | 'done';
}

/** How alike a step must be to one done before the restart to count as the same. */
export const SAME_STEP = 0.6;

/** The irreversible step from before the restart that this one repeats, if any. */
export function priorStep(
  prior: IrreversibleStep[] | undefined,
  o: { text?: string; button?: string },
): IrreversibleStep | null {
  if (!prior?.length) return null;
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
  if (o.button) {
    const b = norm(o.button);
    return [...prior].reverse().find((p) => p.button && norm(p.button) === b) ?? null;
  }
  const t = o.text ?? '';
  if (!t.trim()) return null;
  return (
    [...prior]
      .reverse()
      .find((p) => !p.button && (norm(p.text) === norm(t) || similarity(p.text, t) >= SAME_STEP)) ??
    null
  );
}

/** The task to run when carrying on after a restart: the original, plus what was already done
 *  (the agent checks the screen first, since some of it may be finished). */
export function resumeTask(s: SavedAgentTask): string {
  const done = s.log
    .map((l) => l.text)
    .filter((t) => !/^Task: /.test(t))
    .slice(-15);
  const irrev = s.irreversible ?? [];
  return [
    s.task,
    '',
    `(This task was interrupted by a restart after step ${s.step}. What had been done so far:`,
    ...done.map((t) => `- ${t}`),
    ...(irrev.length
      ? [
          'Irreversible steps already taken: NEVER repeat these (Alton will refuse to):',
          ...irrev.map(
            (i) =>
              `- ${i.text}${i.state === 'started' ? ' (was starting when the task was cut off: it may or may not have happened; check the screen, and ask the user before trying it again)' : ''}`,
          ),
        ]
      : []),
    'Look at the screen first: some of it may already be finished, and windows may have closed. Carry on from where it got to; don’t redo finished steps.)',
  ].join('\n');
}
