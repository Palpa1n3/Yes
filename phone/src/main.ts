/** Alton on the phone, without the PC: talks to Claude directly with the key saved on this
 *  phone. Chats, people and lists live in this browser; memories and chats sync with the PC
 *  through links (nothing goes through any other server). */
import Anthropic from '@anthropic-ai/sdk';
import {
  androidAlarmLink,
  decodeSync,
  chatsToSend,
  mergeChatHistory,
  needsPhone,
  mergeLists,
  snapNames,
  type RouteMap,
  type Person,
  type PhoneAction,
  type PhoneChat,
  type PhoneMessage,
  type SyncFromPc,
  type SyncToPc,
} from '@shared/phone';
import { md, plain } from './md';
import { digestForAi, groupMessages, quickSummary, type PhoneMsg } from '@shared/messages';
import { metresBetween, mountWorkMap, type WorkMap } from './workmap';
import '@shared/ui-style.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/orbitron/400.css';
import '@fontsource/jetbrains-mono/400.css';
import {
  UI_STYLE_GROUPS,
  applyUiStyle,
  cleanUiStyle,
  msgTime,
  type UiStyle,
} from '@shared/ui-style';
import { THEMES } from '../../src/renderer/themes/themes';
import { isSpaceArt, paintSpace } from '../../src/renderer/components/core/spaceArt';
import { startBgMotion } from '../../src/renderer/components/core/bgMotion';
import '@shared/space-backdrops.css';
import { typingDiff } from '@shared/remote-input';
import { nextSleep, shortGaps, sleepLine, type SleepOptions } from '@shared/sleep';
import { gbp, paymentsFrom, spendSummary, type Payment } from '@shared/spending';
import {
  cleanPayslip,
  comparePayslip,
  extractPrice,
  priceDrop,
  spendingCheck,
  takeHomeRate,
  type Payslip,
  type PriceWatch,
} from '@shared/money';
import {
  SMART_HOME_TOOL,
  ST_API,
  cleanSmartInput,
  smartHome,
  type StFetch,
} from '@shared/smartthings';
import { fitReport, type FitOptions } from '@shared/shiftFit';
import { findFeatures } from '@shared/features';
import { CapacitorHttp } from '@capacitor/core';
import { fishRequest } from '../../src/main/services/fish-tts';
import { DEFAULT_FISH_VOICE, FISH_MODELS, type FishModel } from '@shared/voice';
import { fishError } from '../../src/main/services/fish-tts';
import {
  canSpeak,
  setAudioVoice,
  installSpeechShim,
  notifyNow,
  setSpeechVocab,
  isApp,
  isSpeaking,
  loadVoices,
  scheduleNotes,
  Native,
  powerStatus,
  shareFile,
  shareText,
  speak,
  stopSpeaking,
  voiceList,
  type AppMessage,
} from './native';
import {
  PcError,
  isPcAddress,
  pairWithPc,
  pcApi,
  pcInput,
  pcLive,
  pcScreen,
  pcUpload,
  type PcConn,
  type PcJob,
  type PcStatus,
} from './pc';
import { hoursSvg, mondayOf, weekSvg, weeksSummary } from '@shared/shiftChart';
import { runAvatar } from '../../src/renderer/components/core/engines';
import {
  hexToChannels,
  setAvatarMotion,
  type LiveAvatar,
} from '../../src/renderer/components/core/avatarKit';
import { runCodeRing } from '../../src/renderer/components/core/codeRing';
import { runSphere } from '../../src/renderer/components/core/sphere';
import { runFace } from '../../src/renderer/components/core/face';
import { runRings } from '../../src/renderer/components/core/rings';
import {
  PHONE_AVATARS,
  THEME_ACCENT,
  THEME_NAMES,
  isPhoneAvatar,
  type PhoneAvatar,
  SPACE_LOOKS,
} from '@shared/looks';
import { AVATAR_STEPS, type AssistantState, type ThemeId } from '@shared/types';
import {
  PRESETS,
  buildSystemPrompt,
  sanitizePersonality,
  type Personality,
} from '@shared/personalities';
import { dayPhase, isFestive, isFrosty, precipFor, tintFor } from '@shared/ambient';
import { addFix, applyFixes, learnFix, type VoiceFix } from '@shared/vocab';
import {
  alarmFor,
  describeShift,
  currentShift,
  formatAlarmRules,
  homeBy,
  timeLeft,
  leaveBy,
  replaceRota,
  rotaChanges,
  nextShift,
  parseAlarmRules,
  shiftKey,
  spokenTime,
  upcomingShifts,
  weekHours,
  weekPay,
  daysOff,
  manualShift,
  mergeShifts,
  cleanShifts,
  monthGrid,
  monthHours,
  rotaText,
  shiftKind,
  shiftsFromCalendar,
  SHIFT_KIND_LABEL,
  ymd,
  workItems,
  shiftEndNotes,
  nextPayday,
  paydays,
  payPeriod,
  periodPay,
  ukTakeHome,
  type PayCycle,
  type Shift,
  type ShiftAlarmRule,
} from '@shared/shifts';
import {
  addUsage,
  budgetCrossed,
  costOf,
  fmtUsd,
  budgetFromGbp,
  budgetInGbp,
  spendLevel,
  summarise,
  type DayUsage,
} from '@shared/usage';
import {
  APP_TOOLS,
  MONEY_TOOLS,
  PHONE_TOOLS,
  WMO,
  nearbyLink,
  runPhoneTool,
  weatherSummary,
} from './tools';
import { noteId, planHeadsUps, rotaChangeNotes, type HourWeather } from '@shared/headsups';
import { healthReport } from '@shared/diagnostics';
import {
  DEFAULT_PROMPTS,
  expandPrompt,
  matchPromptCommand,
  needsText,
  promptName,
  sanitizePrompts,
  type SavedPrompt,
} from '@shared/prompts';

/* ── State (this browser only) ── */
interface State {
  model: string;
  name: string;
  userName: string;
  systemPrompt: string;
  memories: string[];
  lists: SyncFromPc['lists'];
  chats: PhoneChat[];
  people: Person[];
  pcUrl: string;
  macs: string[];
  country: string;
  speak: boolean;
  autoSend: boolean;
  /** Learned on the phone, not yet sent to the PC. */
  newMemories: string[];
  newListItems: Array<{ list: string; text: string }>;
  lastPcSync: number;
  lastExport: number;
  /** Ticked off / deleted on the phone, not yet sent to the PC. */
  listOps: Array<{ list: string; text: string; op: 'done' | 'remove' }>;
  goals: Array<{ title: string; progress: number }>;
  notes: string[];
  newNotes: string[];
  /** Claude spending on this phone, per day. */
  usage: DayUsage[];
  /** Monthly limit in dollars for a warning (0 = none). */
  budget: number;
  /** Saved prompts from the PC (/fix, /summarize...). */
  prompts: SavedPrompt[];
  /** Chats with a message waiting for signal. */
  queue: string[];
  /** Saver mode: Haiku, a shorter history and fewer web searches. */
  saver: boolean;
  /** Accent colour from the PC (#rrggbb, '' = default) and the avatar to draw. */
  accent: string;
  avatar: PhoneAvatar;
  /** Alton's spoken voice on this phone ('' = best English voice) and speed. */
  voiceName: string;
  voiceRate: number;
  /** Learnt from voice training on the phone (and synced from the PC). */
  voiceFixes: VoiceFix[];
  /** Reminders set from the phone (shown in People › Reminders). */
  reminders: Array<{ what: string; at: number }>;
  /** The PC's HTTPS address over Tailscale (tailscale serve), for automatic switching. */
  pcHttps: string;
  /** Follow the PC's look / personality when connected (off: this phone's own). */
  matchLook: boolean;
  matchPersonality: boolean;
  theme: ThemeId;
  /** Avatar size, glow and motion, steps 1–5 (like the PC). */
  avatarSize: number;
  avatarGlow: number;
  avatarMotion: number;
  timeTint: boolean;
  snow: boolean;
  /** This phone's own personality (used when not following the PC). */
  personality: Personality | null;
  /** Where Alton's voice comes from: automatic, this phone's voices, the PC (Fish Audio through
   *  the PC), or Fish Audio with a key on this phone. And what the PC uses. */
  voiceSource: 'auto' | 'phone' | 'pc' | 'fish';
  pcVoice: SyncFromPc['voice'] | null;
  /** Fish Audio voice ID typed on the phone ('' = the PC's, else the default). */
  fishVoiceId: string;
  /** Watch heads-ups (notifications a Fitbit etc. shows): shift the evening before (hour),
   *  time to leave, morning summary (hour). */
  watchEve: boolean;
  /** New watch heads-ups: rota changes, 30 min left (and the usual break, minutes after the
   *  start; 0 = off), the trip's weather with leave-by, payday, and the end-of-shift summary. */
  watchRota: boolean;
  watchShiftLeft: boolean;
  breakAfter: number;
  watchLeaveWx: boolean;
  watchPayday: boolean;
  watchSummary: boolean;
  /** "Running late" on the leave-by heads-up: who (a saved person or a number) and the text. */
  lateTo: string;
  lateText: string;
  eveHour: number;
  watchLeave: boolean;
  watchMorning: boolean;
  morningHour: number;
  /** Alarms Alton sets are also said out loud to Alexa (and shift alarms too, if wanted). */
  alarmAlexa: boolean;
  shiftAlexa: boolean;
  /** How to reach Alexa: typed in the Alexa app (Android app) or said out loud to the Echo. */
  alexaVia: 'app' | 'speak';
  /** The Echo's name as it shows in the Alexa app ('' = Alexa decides). */
  alexaDevice: string;
  /** Read new messages out loud (Android app): off, with headphones/car Bluetooth, or always. */
  announce: 'off' | 'headphones' | 'always';
  /** Favourite people (read straight away, word for word; others are summarised). */
  msgFavs: string[];
  /** Send new messages to the PC (it reads them out at your desk). */
  msgToPc: boolean;
  /** "While you were away" card on Today after 30+ minutes. */
  catchupPhone: boolean;
  /** When the app was last put away (for the catch-up card). */
  awayAt: number;
  quietFrom: number;
  quietTo: number;
  /** Lock screen live wallpaper (Android app): what to draw, where, and how big. */
  lsVariant: 'cloud' | 'sphere';
  lsPos: 'shortcuts' | 'top-right' | 'top-left' | 'top-middle' | 'bottom';
  lsSize: 'small' | 'medium';
  lsClock: boolean;
  lsLockOnly: boolean;
  /** Show the real weather (rain, snow, storms, fog) on the background. */
  weatherFx: boolean;
  /** Background style, picture darkness (%), and interface options. */
  bg:
    | 'aurora'
    | 'grid'
    | 'stars'
    | 'circuit'
    | 'plain'
    | 'photo'
    | 'nebula'
    | 'ocean'
    | 'sunset'
    | 'forest'
    | 'hex'
    | 'carbon'
    | 'bokeh'
    | 'rings'
    | 'drift'
    | import('@shared/backdrops').SpaceBackdrop;
  bgDim: number;
  uiText: 's' | 'm' | 'l' | 'xl';
  uiCorners: 'round' | 'soft' | 'sharp';
  uiPanels: 'glass' | 'solid' | 'outline';
  uiChat: 'bubbles' | 'minimal';
  uiCompact: boolean;
  /** Fonts, glass panels, chat look, tab bar, spacing and motion (Settings › Look › Interface). */
  uiStyle: UiStyle;
  uiScan: boolean;
  /** Driving mode reads new messages out. */
  readOut: boolean;
  /** Android app: the shift app to read, setting shift alarms by themselves, and which are set. */
  shiftApp: string;
  shiftAppName: string;
  /** A tab to tap after opening it (where the rota is), e.g. "Schedule". */
  shiftTab: string;
  /** "At work": where (set on the phone), which lists to show, and the before-you-leave note. */
  /** Read the shift app by itself while charging. */
  autoRota: boolean;
  autoRotaLast: number;
  workName: string;
  workSet: boolean;
  /** The workplace on the map, and how close counts as there (metres). */
  workLat: number;
  workLon: number;
  workRadius: number;
  workLists: string[];
  workEnd: boolean;
  workEndLead: number;
  /** Send texts/WhatsApp/Snapchat/replies straight away (no tap). */
  autoMessages: boolean;
  /** The rota app's "next week" button, and how many weeks to read. */
  shiftNext: string;
  shiftWeeks: number;
  autoAlarms: boolean;
  alarmsSet: string[];
  /** Saved prompts were changed on the phone: keep them rather than the PC's. */
  promptsMine: boolean;
  /** Send chats to the PC's Alton (full tools) when connected. */
  usePc: boolean;
  /** The connected PC's name and Alton version. */
  pcName: string;
  pcVersion: string;
  /** Upcoming shifts last sent to the PC (so they're only sent when they change). */
  shiftsSent: string;
  /** App lock: salted SHA-256 of the PIN ('' = no lock). */
  pinHash: string;
  pinSalt: string;
  /** Shifts already put in the calendar (start/end keys), so they aren't added twice. */
  addedShifts: string[];
  /** Shifts read from rotas (upcoming and the last week). */
  shifts: Shift[];
  /** Wake-up alarm this long before a shift, unless a rule gives an exact time. */
  shiftLead: number;
  shiftRules: ShiftAlarmRule[];
  /** Shifts whose "tomorrow" card was closed. */
  shiftCardsDone: string[];
  /** Hourly pay (0 = don't show pay) and unpaid break per long shift, in minutes. */
  payRate: number;
  unpaidBreak: number;
  /** The break comes off every shift (not just ones over 6 hours). */
  breakAll: boolean;
  /** A known payday ("2026-12-11"), how often pay comes, and how many days before payday the paid period ends. */
  payNext: string;
  payCycle: PayCycle;
  payLag: number;
  paydaysAdded: string[];
  /** Minutes to get to work, for "leave by". */
  travel: number;
  /** Words that mark a calendar event as a shift (From my calendar). */
  shiftWords: string;
  /** Last backup saved, and when the reminder was last put off (ms). */
  lastBackup: number;
  backupSnooze: number;
  /** Sleep planner: bedtime nudges on, hours wanted, minutes of wind-down. */
  sleepOn: boolean;
  sleepHours: number;
  windDown: number;
  /** Spending: bank apps whose payment notifications are kept (packages and names). */
  spendApps: string[];
  spendNames: string[];
  /** The shift app's tab with open shifts / swaps. */
  tradeTab: string;
  /** Payslips read by Alton (newest last) — for checking pay and a truer take-home. */
  payslips: Payslip[];
  /** Prices being watched ("Watch this"), checked about once a day. */
  priceWatches: PriceWatch[];
}
const KEY = 'alton-phone-v1';
const DEFAULTS: State = {
  model: 'claude-haiku-5-5',
  name: 'Alton',
  userName: '',
  systemPrompt: '',
  memories: [],
  lists: [],
  chats: [],
  people: [],
  pcUrl: '',
  macs: [],
  country: '44',
  speak: false,
  autoSend: true,
  newMemories: [],
  newListItems: [],
  lastPcSync: 0,
  lastExport: 0,
  listOps: [],
  goals: [],
  notes: [],
  newNotes: [],
  usage: [],
  budget: 0,
  prompts: DEFAULT_PROMPTS,
  queue: [],
  saver: false,
  accent: '',
  avatar: 'orb',
  voiceName: '',
  voiceRate: 1,
  voiceFixes: [],
  reminders: [],
  pcHttps: '',
  matchLook: true,
  matchPersonality: true,
  theme: 'arc-cyan',
  avatarSize: 3,
  avatarGlow: 3,
  avatarMotion: 3,
  timeTint: true,
  snow: true,
  personality: null,
  promptsMine: false,
  voiceSource: 'auto',
  pcVoice: null,
  fishVoiceId: '',
  watchEve: true,
  watchRota: true,
  watchShiftLeft: true,
  breakAfter: 0,
  watchLeaveWx: true,
  watchPayday: true,
  watchSummary: true,
  lateTo: '',
  lateText: 'Running 10 min late',
  eveHour: 20,
  watchLeave: true,
  watchMorning: true,
  morningHour: 7,
  alarmAlexa: true,
  shiftAlexa: false,
  alexaVia: 'app',
  alexaDevice: '',
  announce: 'off',
  msgFavs: [],
  msgToPc: true,
  catchupPhone: true,
  awayAt: 0,
  quietFrom: 23,
  quietTo: 7,
  weatherFx: true,
  lsVariant: 'sphere',
  lsPos: 'shortcuts',
  lsSize: 'small',
  lsClock: false,
  lsLockOnly: true,
  bg: 'aurora',
  bgDim: 60,
  uiText: 'm',
  uiCorners: 'round',
  uiPanels: 'glass',
  uiChat: 'bubbles',
  uiCompact: false,
  uiStyle: cleanUiStyle({}),
  uiScan: false,
  readOut: true,
  shiftApp: '',
  shiftAppName: '',
  shiftTab: '',
  autoRota: true,
  autoRotaLast: 0,
  workName: '',
  workSet: false,
  workLat: 0,
  workLon: 0,
  workRadius: 150,
  workLists: ['Shopping'],
  workEnd: true,
  workEndLead: 0,
  autoMessages: true,
  shiftNext: '',
  shiftWeeks: 2,
  autoAlarms: true,
  alarmsSet: [],
  usePc: true,
  pcName: '',
  pcVersion: '',
  shiftsSent: '',
  pinHash: '',
  pinSalt: '',
  addedShifts: [],
  shifts: [],
  shiftLead: 90,
  shiftRules: [],
  shiftCardsDone: [],
  payRate: 0,
  unpaidBreak: 0,
  breakAll: false,
  payNext: '',
  payCycle: 28,
  payLag: 0,
  paydaysAdded: [],
  travel: 0,
  shiftWords: 'shift, work',
  lastBackup: 0,
  backupSnooze: 0,
  sleepOn: true,
  sleepHours: 8,
  windDown: 45,
  spendApps: [],
  spendNames: [],
  tradeTab: 'Shift Trade',
  payslips: [],
  priceWatches: [],
};
const ls = {
  get: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string): void => {
    try {
      localStorage.setItem(k, v);
    } catch {
      toast('This phone’s storage is full; old chats may not be saved.');
    }
  },
  del: (k: string): void => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
let S: State = { ...DEFAULTS, ...(JSON.parse(ls.get(KEY) ?? '{}') as Partial<State>) };
// Older versions had a single "Compact spacing" switch.
S.uiStyle = cleanUiStyle(S.uiStyle ?? (S.uiCompact ? { spacing: 'compact' } : {}));
let apiKey = ls.get('alton-key') ?? '';
const save = (): void => {
  ls.set(KEY, JSON.stringify(S));
  queueWorkSync();
  updateSpeechVocab();
};
/** Words the phone's speech recogniser should favour: names, lists, places and apps. */
function updateSpeechVocab(): void {
  setSpeechVocab(
    [
      S.name,
      S.userName,
      ...S.people.flatMap((p) => [p.name, p.snap ?? '']),
      ...S.lists.map((l) => l.name),
      S.workName,
      S.shiftAppName,
      S.alexaDevice,
      ...S.spendNames,
    ].filter(Boolean),
    S.voiceFixes,
  );
}
/** Keep the "at work" list on the phone side up to date (a moment after changes settle). */
let workSyncTimer = 0;
function queueWorkSync(): void {
  if (!isApp || !S.workSet) return;
  clearTimeout(workSyncTimer);
  workSyncTimer = window.setTimeout(() => {
    const items = workItems(S.lists, S.workLists);
    const key = JSON.stringify(items);
    if (key === lastWorkItems) return;
    lastWorkItems = key;
    void Native.setPlace({ items, listLabel: S.workLists.join(' & ') || 'Shopping' }).catch(
      () => undefined,
    );
    void scheduleWatch();
  }, 2500);
}
let lastWorkItems = '';
/** Whether the phone says we're at work right now (for Claude). */
let atWork: { here: boolean; since: number } = { here: false, since: 0 };
let chatId: string | null = S.chats[0]?.id ?? null;
let research = false;
let busy: AbortController | null = null;
let pending: Array<{ data: string; thumb: string }> = [];
/** A PDF in `pending` (payslips, statements): its data starts with this. */
const PDF = 'pdf:';
const PDF_THUMB =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="10" fill="#b3261e"/><text x="40" y="49" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">PDF</text></svg>',
  );
function readPdf(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (f.size > 8_000_000) return reject(new Error('That PDF is too big (8 MB max).'));
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(PDF + s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(new Error('Couldn’t read that PDF.'));
    r.readAsDataURL(f);
  });
}
let view = 'chat';

/* ── DOM helpers ── */
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function toast(t: string): void {
  const x = $('toast');
  x.textContent = t;
  x.style.display = 'block';
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(
    () => (x.style.display = 'none'),
    2600,
  );
}
const uid = (): string => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const android = /android/i.test(navigator.userAgent);
const cleanTitle = (t: string): string => t.replace(/[*_`#]+/g, '').trim() || 'Chat';

/* ── What the PC knows (from live sync, or an old #sync= link) ── */
const step = (n: unknown, d: number): number =>
  typeof n === 'number' && n >= 1 && n <= 5 ? Math.round(n) : d;
function lookFromPc(l: SyncFromPc['look']): Partial<State> {
  if (!l) return {};
  return {
    accent: /^#[0-9a-f]{6}$/i.test(l.accent) ? l.accent : S.accent,
    avatar: isPhoneAvatar(l.avatar) ? l.avatar : S.avatar,
    theme: l.theme && l.theme in THEME_ACCENT ? (l.theme as ThemeId) : S.theme,
    avatarSize: step(l.size, S.avatarSize),
    avatarGlow: step(l.glow, S.avatarGlow),
    avatarMotion: step(l.motion, S.avatarMotion),
    timeTint: typeof l.timeTint === 'boolean' ? l.timeTint : S.timeTint,
  };
}
function applyFromPc(d: SyncFromPc): void {
  S = {
    ...S,
    name: d.name || S.name,
    userName: d.userName || S.userName,
    systemPrompt: d.systemPrompt || S.systemPrompt,
    pcVoice: d.voice ?? S.pcVoice,
    personality:
      S.matchPersonality && d.personality ? sanitizePersonality(d.personality) : S.personality,
    model: d.model || S.model,
    memories: [...new Set([...d.memories, ...S.newMemories])],
    // Keep the phone's not-yet-sent additions, ticks and deletions on top of the PC's lists.
    lists: mergeLists(d.lists, S.newListItems, S.listOps),
    chats: mergeChatHistory(S.chats, d.chats),
    pcUrl: d.pcUrl || S.pcUrl,
    macs: d.macs?.length ? d.macs : S.macs,
    goals: d.goals ?? S.goals,
    shifts: d.shifts?.length ? mergeShifts(S.shifts, cleanShifts(d.shifts)) : S.shifts,
    notes: [...S.newNotes, ...(d.notes ?? S.notes)],
    prompts: d.prompts && !S.promptsMine ? sanitizePrompts(d.prompts) : S.prompts,
    voiceFixes: (d.voiceFixes ?? []).reduce((acc, f) => addFix(acc, f), S.voiceFixes),
    ...(S.matchLook ? lookFromPc(d.look) : {}),
    lastPcSync: Date.now(),
    pcHttps: isPcAddress(d.pcUrl.replace(/\/+$/, '')) ? d.pcUrl.replace(/\/+$/, '') : S.pcHttps,
  };
  save();
  void scheduleWatch();
}
/** Old-style sync link from the PC (still works for one more version). */
function takeHash(): void {
  const h = location.hash;
  if (!h.startsWith('#sync=')) return;
  const d = decodeSync<SyncFromPc>(h.slice(6));
  history.replaceState(null, '', location.pathname + location.search);
  if (!d || d.v !== 1) return toast('That sync link was damaged. Try again from the PC.');
  applyFromPc(d);
  toast(`Synced from your PC: ${d.memories.length} memories, ${d.chats.length} chats`);
}

/* ── Claude ── */
function systemText(): string {
  const now = new Date();
  const own =
    !S.matchPersonality && S.personality
      ? buildSystemPrompt({ ...S.personality, assistantName: S.name }, S.userName)
          .replace("a desktop assistant running on the user's computer", 'a personal assistant')
          .replace('To act on the computer, call a tool rather than describing the action.', '')
      : '';
  const base =
    own ||
    S.systemPrompt ||
    `You are ${S.name}, a friendly, capable personal assistant${S.userName ? ` for ${S.userName}` : ''}.`;
  return [
    base,
    `You are running in ${S.name}'s phone app. The user's PC may be off, so you cannot control the PC, its files or apps here (when the PC is on and connected, the user's messages go to the PC's Alton instead, which can).`,
    "Messages are often spoken and turned into text by the phone, so words can be misheard (the user has a UK, possibly Welsh, accent). Work out what they most likely meant; if it could mean different things, ask a short question. Don't comment on the mistakes.",
    'Ideas for improving Alton: when the user wishes you could do something, a request fails because you lack a feature, or they suggest an improvement, add a short specific idea to the list "Alton roadmap" with add_to_list (it syncs to the PC roadmap) and mention it briefly.',
    driving
      ? 'DRIVING MODE: the user is driving and hears your reply read aloud. Answer in one or two short spoken sentences, no lists, links or formatting. For texts and replies, get them ready (send_message / reply_message): the user confirms by saying "send it". Never ask them to look at or tap the screen unless unavoidable.'
      : '',
    isApp
      ? "You are in the Alton Android app with extra phone powers: read_messages (texts, WhatsApp… from notifications) and reply_message (a reply to one of them), read_calendar for what's on (add_calendar_event adds straight in; edit_event changes events straight away; delete_event makes a Delete button), find_contact for numbers, and read_shift_app to read the rota from their shift app (then add_shifts, which goes straight into the calendar), snapchat_message to send Snapchat chats (people's Snapchat nicknames are saved), and media_control for music. Tomorrow's shift alarm is set in the Clock app automatically. If a power is switched off, tell them where to turn it on (Settings › Phone access)."
      : '',
    'Alexa: you cannot reach Alexa directly; tell_alexa makes the phone say a command out loud for a nearby Echo (e.g. turning alarms or lights on).',
    isApp
      ? ''
      : 'Shifts: you cannot open or read other apps. To add work shifts to the calendar, the user shares a screenshot of their rota/shift app (screenshot it, then Share › Alton, or the camera button here); read it and use add_shifts. If they ask without a screenshot, tell them that in one or two short steps.',
    isApp && S.autoMessages
      ? 'Messages send by themselves (the user switched this on): when the user asks you to text, WhatsApp, Snapchat or reply to someone, call the tool straight away (no "shall I send it?") and it is sent at once; the tool result says SENT or why not. If the person is not in their saved people, look them up with find_contact first and use that number (only ask if several people match or none do). People are often saved in the contacts under a nickname: when the user says who someone is ("Will is Fives", "Mum is saved as Mammy"), find_contact that contact name, save_contact it under the name the user uses (Will), and then send whatever was waiting without asking again. Only ask before sending when who or what is unclear. Calls and emails are still buttons the user taps. You can also check where the user is (get_location) and the local weather (get_weather).'
      : 'On the phone you can get things ready with your tools: texts and WhatsApp messages, calls, emails, directions, places nearby, calendar events, timers/alarms (Android), sharing and links. Each becomes a button the user taps and then confirms; never say a message was sent or a call made. If you do not know who someone is, ask, or use the contact button. You can also check where the user is (get_location) and the local weather (get_weather).',
    'Write for a phone screen: short paragraphs, bullet points when useful. You can search the web when it helps.',
    `Current local date and time: ${now.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`,
    atWork.here
      ? `The user's phone says they are at work (${S.workName || 'work'}) right now. Their ${S.workLists.join(' & ') || 'shopping'} list: ${workItems(S.lists, S.workLists).join(', ') || 'empty'}.`
      : '',
    shiftLine(),
    msgDigest
      ? `Messages waiting on the phone: ${msgDigest} In a briefing ("brief me", "good morning"), mention them in one line; use summarise_messages for details.`
      : '',
    S.people.length ? `People the user has saved: ${S.people.map((p) => p.name).join(', ')}.` : '',
    S.memories.length
      ? `Things you know about the user:\n${S.memories.map((m) => `- ${m}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The model to use now (Saver mode always uses Haiku). */
const model = (): string => (S.saver ? 'claude-haiku-5-5' : S.model);

function webTools(): Anthropic.Messages.ToolUnion[] {
  const n = S.saver ? (research ? 3 : 1) : research ? 8 : 3;
  return model() === 'claude-haiku-5-5'
    ? [
        { type: 'web_search_20250305', name: 'web_search', max_uses: n },
        ...(research
          ? [{ type: 'web_fetch_20250910' as const, name: 'web_fetch' as const, max_uses: 5 }]
          : []),
      ]
    : [
        { type: 'web_search_20260209', name: 'web_search', max_uses: n },
        ...(research
          ? [{ type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 5 }]
          : []),
      ];
}

function buildHistory(chat: PhoneChat, images: string[]): Anthropic.MessageParam[] {
  // Saver mode sends less of the chat each time (the biggest cost in long chats).
  const msgs = chat.messages.slice(S.saver ? -10 : -30);
  return msgs.map((m, i) => {
    if (m.role === 'assistant') return { role: 'assistant', content: m.text || '…' };
    // "Brief me" is shown as typed but asks for the full briefing.
    if (m.text === 'Brief me') return { role: 'user', content: BRIEF };
    const last = i === msgs.length - 1;
    if (!last || !images.length) return { role: 'user', content: m.text };
    return {
      role: 'user',
      content: [
        ...images.map((data) =>
          data.startsWith(PDF)
            ? {
                type: 'document' as const,
                source: {
                  type: 'base64' as const,
                  media_type: 'application/pdf' as const,
                  data: data.slice(PDF.length),
                },
              }
            : {
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
              },
        ),
        { type: 'text' as const, text: m.text },
      ],
    };
  });
}

async function ask(chat: PhoneChat, images: string[]): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const messages = buildHistory(chat, images);
  const reply: PhoneMessage = {
    role: 'assistant',
    text: '',
    at: Date.now(),
    actions: [],
    sources: [],
  };
  chat.messages.push(reply);
  const ctrl = new AbortController();
  busy = ctrl;
  setSending(true);
  let activity = 'Thinking…';
  const live = (): void => renderMsgs(activity);
  // One system prompt for the whole reply: it includes the time, and a slow tool (reading the
  // shift app) can cross a minute. A changed prompt makes the API reject the earlier thinking.
  const system = systemText();
  try {
    for (let step = 0; step < 6; step++) {
      const stream = client.messages.stream(
        {
          model: model(),
          max_tokens: 16000,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          tools: [
            ...PHONE_TOOLS,
            ...MONEY_TOOLS,
            ...(isApp ? APP_TOOLS : []),
            ...(isApp && stToken ? [SMART_HOME_TOOL as Anthropic.Tool] : []),
            ...webTools(),
          ],
          messages,
          thinking: { type: 'adaptive' },
          output_config: { effort: research ? 'medium' : 'low' },
        },
        { signal: ctrl.signal },
      );
      let base = reply.text;
      stream.on('text', (_d, snapshot) => {
        reply.text = (base ? `${base}\n\n` : '') + snapshot;
        activity = '';
        live();
      });
      stream.on('streamEvent', (ev) => {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') {
          activity =
            ev.content_block.name === 'web_fetch' ? 'Reading a page…' : 'Searching the web…';
          live();
        }
      });
      const msg = await stream.finalMessage();
      {
        const before = summarise(S.usage, S.budget).month;
        S.usage = addUsage(S.usage, costOf(model(), msg.usage), research ? 'research' : 'chat');
        const crossed = budgetCrossed(before, summarise(S.usage, S.budget).month, S.budget);
        renderSpend();
        if (crossed)
          toast(
            crossed === 100
              ? `You've reached this month's limit (${fmtUsd(S.budget)}) on this phone.`
              : `80% of this month's limit used on this phone.`,
          );
      }
      base = reply.text;
      for (const b of msg.content)
        if (b.type === 'text' && b.citations)
          for (const c of b.citations)
            if ('url' in c && c.url && !reply.sources?.some((x) => x.url === c.url))
              reply.sources?.push({ url: c.url, title: ('title' in c && c.title) || c.url });
      messages.push({ role: 'assistant', content: msg.content });
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (msg.stop_reason === 'pause_turn') continue;
      if (!uses.length) break;
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        // Payslips, listings, spending check and price watching.
        const mon = await moneyTool(u.name, u.input);
        if (mon) {
          if (mon.actions) reply.actions?.push(...mon.actions);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: mon.result });
          continue;
        }
        // The Android app's own powers (messages, calendar, contacts, shift app).
        const nat = isApp ? await appTool(u.name, u.input) : null;
        if (nat) {
          if (nat.action) reply.actions?.push(nat.action);
          results.push({ type: 'tool_result', tool_use_id: u.id, content: nat.result });
          activity = nat.activity ?? activity;
          continue;
        }
        // Location and weather need the phone (and the internet), so they run here.
        const live2 = await placeTool(u.name, u.input);
        if (live2) {
          if (live2.action) reply.actions?.push(live2.action);
          if (live2.actions) reply.actions?.push(...live2.actions);
          if (live2.map) reply.map = live2.map;
          results.push({ type: 'tool_result', tool_use_id: u.id, content: live2.result });
          continue;
        }
        const out = runPhoneTool(u.name, u.input, {
          people: S.people,
          memories: S.memories,
          lists: S.lists,
          country: S.country,
          android,
          addedShifts: S.addedShifts,
          shifts: S.shifts,
          payRate: S.payRate,
          unpaidBreak: S.unpaidBreak,
          breakOver: S.breakAll ? 0 : 6,
        });
        if (out.shifts?.length) {
          alertRotaChanges(S.shifts, out.shifts);
          S.shifts = replaceRota(S.shifts, out.shifts);
          void scheduleWatch();
        }
        if (isApp && u.name === 'add_shifts' && out.shifts?.length)
          await shiftsIntoCalendar(out, u.input);
        if (out.reminder) {
          S.reminders = [...S.reminders.filter((x) => x.at > Date.now()), out.reminder]
            .sort((a, b) => a.at - b.at)
            .slice(0, 50);
          scheduleReminderPings();
        }
        if (out.action) reply.actions?.push(out.action);
        if (out.actions) reply.actions?.push(...out.actions);
        // "Send messages by themselves": send now instead of leaving a button to tap.
        if (S.autoMessages && isApp) {
          const notes: string[] = [];
          for (const a of [out.action, ...(out.actions ?? [])]) {
            if (!a) continue;
            activity = 'Sending…';
            live();
            const r = await autoSendAction(a);
            if (r) notes.push(r);
          }
          if (notes.length)
            out.result = `${notes.join(' ')} (Sent automatically: do not ask the user to tap anything. Confirm in one short sentence who it went to.)`;
        }
        if (out.remember) {
          S.memories.push(out.remember);
          S.newMemories.push(out.remember);
        }
        if (out.person)
          S.people = [
            ...S.people.filter((p) => p.name.toLowerCase() !== out.person?.name.toLowerCase()),
            out.person,
          ];
        for (const li of out.listItems ?? []) {
          const l =
            S.lists.find((x) => x.name.toLowerCase() === li.list.toLowerCase()) ??
            (S.lists.push({ name: li.list, items: [] }), S.lists[S.lists.length - 1]);
          l?.items.push({ text: li.text, done: false });
          S.newListItems.push(li);
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out.result });
      }
      messages.push({ role: 'user', content: results });
      activity = 'Working on it…';
      live();
    }
  } catch (err) {
    if (!ctrl.signal.aborted) {
      const m = friendlyError(err);
      reply.text = `${reply.text}${reply.text ? '\n\n' : ''}_${m}_`;
    }
  } finally {
    busy = null;
    setSending(false);
    if (!reply.text && !reply.actions?.length) reply.text = '_(stopped)_';
    chat.updatedAt = Date.now();
    save();
    renderMsgs();
    if (driving) driveAfterReply(reply);
    else if (handsFree) say(reply.text, true, () => handsFree && !busy && toggleMic());
    else say(reply.text);
  }
}

/** Sends a message action straight away. Returns what happened for Claude, or null if it isn't a send. */
async function autoSendAction(a: PhoneAction): Promise<string | null> {
  if (a.done) return null;
  let run: (() => Promise<unknown>) | null = null;
  let what = '';
  if (a.reply) {
    const r = a.reply;
    run = () => Native.replyMessage(r);
    what = `the reply "${r.text}"`;
  } else if (a.snap) {
    const sn = a.snap;
    run = () => Native.snapSend(sn);
    what = `"${sn.text}" to ${sn.name} on Snapchat`;
  } else if (a.href) {
    const sms = /^sms:([+\d]+)\?&?body=(.*)$/i.exec(a.href);
    const wa = /^https:\/\/wa\.me\/(\d+)\?text=(.*)$/i.exec(a.href);
    if (sms?.[1]) {
      const to = sms[1];
      const text = decodeURIComponent(sms[2] ?? '');
      run = () => Native.sendSms({ to, text });
      what = `a text "${text}" (${a.label})`;
    } else if (wa?.[1]) {
      const phone = wa[1];
      const text = decodeURIComponent(wa[2] ?? '');
      run = () => Native.waSend({ phone, text });
      what = `"${text}" on WhatsApp (${a.label})`;
    }
  }
  if (!run) return null;
  try {
    await run();
    a.done = 'Sent ✓';
    return `SENT ${what}.`;
  } catch (e) {
    return `Couldn't send ${what} by itself (${(e as Error).message}); the button is still there to tap.`;
  }
}

/** Plain-English errors for the common problems. */
function friendlyError(err: unknown): string {
  if (!navigator.onLine) return 'You’re offline. Check your signal or Wi-Fi and try again.';
  if (err instanceof Anthropic.AuthenticationError)
    return 'Your Claude key was rejected. Check it in Settings › Change API key.';
  if (err instanceof Anthropic.PermissionDeniedError)
    return 'Your Claude key isn’t allowed to use this model. Try another model in Settings.';
  if (err instanceof Anthropic.RateLimitError)
    return 'Too many requests for a moment. Wait a few seconds and try again.';
  if (err instanceof Anthropic.APIConnectionError)
    return 'Couldn’t reach Claude. Check your internet connection.';
  if (err instanceof Anthropic.APIError) {
    const text = err.message.toLowerCase();
    if (text.includes('credit'))
      return 'Your Anthropic account is out of credit. Top up at console.anthropic.com › Billing.';
    if (err.status === 529 || text.includes('overloaded'))
      return 'Claude is very busy right now. Try again in a minute.';
    if (err.status === 413 || text.includes('too large'))
      return 'That was too big to send (try fewer or smaller photos).';
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/* ── Location & weather ── */
let lastFix: { lat: number; lon: number; at: number } | null = null;
function locate(): Promise<{ lat: number; lon: number } | null> {
  if (lastFix && Date.now() - lastFix.at < 10 * 60_000) return Promise.resolve(lastFix);
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lon: p.coords.longitude, at: Date.now() };
        resolve(lastFix);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 },
    ),
  );
}
async function placeTool(
  name: string,
  input: unknown,
): Promise<{
  result: string;
  action?: PhoneAction;
  actions?: PhoneAction[];
  map?: RouteMap;
} | null> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (name === 'directions') return routeTool(o);
  if (name === 'get_location') {
    const f = await locate();
    return {
      result: f
        ? `The user is at latitude ${f.lat.toFixed(4)}, longitude ${f.lon.toFixed(4)}. Use web search with these coordinates or the nearest town to answer local questions.`
        : 'Location is off or not allowed on this phone. Ask the user where they are.',
    };
  }
  if (name === 'find_nearby') {
    const q = String(o.query ?? '').slice(0, 100);
    const f = await locate();
    return {
      result: 'It is ready as a button that opens Google Maps around the user.',
      action: {
        label: `Find ${q} nearby`,
        sub: f ? 'Around you, in Google Maps' : 'In Google Maps',
        href: nearbyLink(q, f?.lat, f?.lon),
      },
    };
  }
  if (name === 'get_weather') {
    let lat: number | undefined;
    let lon: number | undefined;
    let where = 'where the user is';
    const place = String(o.place ?? '')
      .trim()
      .slice(0, 80);
    try {
      if (place) {
        const g = (await (
          await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`,
          )
        ).json()) as {
          results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
        };
        const r = g.results?.[0];
        if (!r) return { result: `Couldn't find a place called ${place}.` };
        lat = r.latitude;
        lon = r.longitude;
        where = `${r.name}${r.country ? `, ${r.country}` : ''}`;
      } else {
        const f = await locate();
        if (!f) return { result: 'Location is off on this phone; ask the user which town.' };
        lat = f.lat;
        lon = f.lon;
      }
      const w = (await (
        await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`,
        )
      ).json()) as Parameters<typeof weatherSummary>[0];
      return { result: `Weather for ${where}: ${weatherSummary(w)}` };
    } catch {
      return { result: 'The weather service could not be reached.' };
    }
  }
  return null;
}

/* ── Chat UI ── */
const chat = (): PhoneChat | undefined => S.chats.find((c) => c.id === chatId);

/** Take back the last question (and its answer). */
function takeLast(): PhoneMessage | null {
  const c = chat();
  if (!c || busy) return null;
  let i = -1;
  for (let k = c.messages.length - 1; k >= 0; k--)
    if (c.messages[k]?.role === 'user') {
      i = k;
      break;
    }
  const u = c.messages[i];
  if (!u) return null;
  c.messages = c.messages.slice(0, i);
  save();
  return u;
}
function regenerate(): void {
  const u = takeLast();
  if (u) send(u.text);
}
function editLast(): void {
  const u = takeLast();
  if (!u) return;
  renderMsgs();
  const ta = $<HTMLTextAreaElement>('msg');
  ta.value = u.text;
  ta.focus();
}

function newChat(r = false): PhoneChat {
  const c: PhoneChat = {
    id: uid(),
    title: 'New chat',
    research: r,
    updatedAt: Date.now(),
    messages: [],
  };
  S.chats.unshift(c);
  chatId = c.id;
  research = r;
  save();
  return c;
}

const BRIEF =
  'Give me my briefing: the date, the weather where I am today and the next couple of days (use get_weather), what is on my lists (get_lists), and one useful tip for the day. Keep it short and friendly.';

function send(text?: string, expanded = false, typed?: string): void {
  const ta = $<HTMLTextAreaElement>('msg');
  const t = (text ?? ta.value).trim();
  if ((!t && !pending.length) || busy) return;
  if (!apiKey) return toast('Add your Claude key in Settings first.');
  // "/fix some text": a saved prompt. With nothing after it, use what was copied.
  const pm = expanded ? null : matchPromptCommand(t, S.prompts);
  if (pm) {
    const go = (x: string): void => {
      if (needsText(pm.prompt) && !x.trim() && !pending.length) {
        ta.value = `/${pm.prompt.name} `;
        ta.focus();
        return toast(`Type or paste some text after /${pm.prompt.name}`);
      }
      send(expandPrompt(pm.prompt, x), true, `/${pm.prompt.name} ${x.trim()}`.trim());
    };
    hideSlash();
    if (pm.rest.trim() || !needsText(pm.prompt) || !navigator.clipboard?.readText)
      return go(pm.rest);
    ta.value = '';
    void navigator.clipboard
      .readText()
      .catch(() => '')
      .then(go);
    return;
  }
  ta.value = '';
  ta.style.height = 'auto';
  const c = chat() ?? newChat(research);
  const imgs = pending;
  pending = [];
  renderThumbs();
  c.messages.push({
    role: 'user',
    text: t || 'Please take a look at this.',
    at: Date.now(),
    images: imgs.map((i) => i.thumb),
  });
  if (c.title === 'New chat') c.title = (typed || t || 'Photo').slice(0, 50);
  c.research = research;
  c.updatedAt = Date.now();
  if (!navigator.onLine) {
    // No signal: keep it and send it when the phone is back online.
    if (!S.queue.includes(c.id)) S.queue.push(c.id);
    queuedImages.set(
      c.id,
      imgs.map((i) => i.data),
    );
    save();
    renderMsgs();
    return toast('No signal. I’ll send it as soon as you’re back online.');
  }
  save();
  renderMsgs('Thinking…');
  // While driving, the phone answers itself so texts can be confirmed by voice.
  // Some jobs need this phone itself (reading its apps): the phone answers those.
  // Once a chat has done a phone-only job, its follow-ups ("do it again") stay on the phone too.
  const here =
    (isApp && (phoneOnlyNext || phoneChats.has(c.id) || needsPhone(t))) ||
    moneyNext ||
    imgs.some((i) => i.data.startsWith(PDF));
  moneyNext = false;
  phoneOnlyNext = false;
  if (here) phoneChats.add(c.id);
  if (usePcNow() && !driving && !here) void askPc(c, imgs);
  else
    void ask(
      c,
      imgs.map((i) => i.data),
    );
}

const money = (n: number): string =>
  new Intl.NumberFormat(navigator.language || 'en-GB', {
    style: 'currency',
    currency: S.country === '1' ? 'USD' : S.country === '353' ? 'EUR' : 'GBP',
  }).format(n);

/* ── Alexa: the phone says the command out loud for a nearby Echo ── */
function tellAlexa(command: string): void {
  if (!canSpeak()) return toast('This phone can’t speak out loud.');
  stopSpeaking();
  // A short gap after the wake word so the Echo is listening before the command.
  speak('Alexa.', {
    rate: 0.95,
    onend: () => setTimeout(() => speak(command, { rate: 0.95 }), 900),
  });
  toast('Speaking to Alexa… keep the phone near your Echo, volume up.');
}

/** For Claude: the next shift (so "brief me" and "am I working?" just know). */
function shiftLine(): string {
  const cur = currentShift(S.shifts);
  const home = cur ? homeBy(cur, S.travel) : '';
  const now = cur
    ? `The user is at work now (${cur.title}), finishing at ${cur.end.slice(11, 16)} (${timeLeft(cur)} left)${home ? `, home about ${home}` : ''}. `
    : '';
  const n = nextShift(S.shifts, new Date(), 48);
  const rate =
    S.payRate > 0
      ? ` They earn ${money(S.payRate)} an hour${S.unpaidBreak ? ` with a ${S.unpaidBreak}-minute unpaid break ${S.breakAll ? 'on every shift' : 'on shifts over 6 hours'}` : ''}.`
      : '';
  const travel = S.travel ? ` It takes them about ${S.travel} minutes to get to work.` : '';
  const pd = payInfo();
  const payday = pd
    ? ` Next payday: ${pd.label} (${pd.when}).${pd.gross > 0 ? ` From the shifts saved for that pay period (${pd.hours}h) it should be about ${money(pd.gross)} before tax, roughly ${money(pd.net)} after tax and NI (a rough estimate).` : ''}`
    : '';
  const sl = sleepText();
  const gap = shortGaps(S.shifts)[0];
  const sleep = `${sl ? ` Sleep plan (${S.sleepHours} h wanted): ${sl}` : ''}${gap ? ` Short gap: only ${gap.hours} h between ${describeShift(gap.after)} and ${describeShift(gap.before)}.` : ''}`;
  return n
    ? `${now}Next work shift: ${n.when === 'later' ? '' : `${n.when}, `}${describeShift(n.shift)} ${n.shift.title}. Mention it in briefings.${rate}${travel}${payday}${sleep}`
    : S.shifts.length || pd
      ? `${now}No other work shift in the next two days.${rate}${payday}`
      : '';
}

/* ── Backup: everything on this phone (except the Claude key) to a file, and back ── */
function backup(): void {
  const data = JSON.stringify({ app: 'alton-phone', v: 1, at: Date.now(), state: S });
  if (isApp) {
    // The app can't download: hand the file to the share sheet (Drive, My Files…).
    const name = `alton-backup-${new Date().toISOString().slice(0, 10)}.json`;
    void shareFile(name, data, 'Alton backup').then((ok) => {
      if (!ok) return toast('Couldn’t save the backup.');
      S.lastBackup = Date.now();
      save();
      renderBackupNudge();
      toast('Pick where to keep it (Drive or My Files). Your Claude key isn’t in it.');
    });
    return;
  }
  const file = new File([data], `alton-backup-${new Date().toISOString().slice(0, 10)}.json`, {
    type: 'application/json',
  });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  S.lastBackup = Date.now();
  save();
  renderBackupNudge();
  toast('Backup saved to Downloads. Your Claude key isn’t in it.');
}

async function restore(f: File): Promise<void> {
  try {
    const raw = JSON.parse(await f.text()) as { app?: string; state?: Partial<State> };
    if (raw.app !== 'alton-phone' || !raw.state || typeof raw.state !== 'object')
      return toast('That isn’t an Alton backup file.');
    const st = raw.state;
    const n = Array.isArray(st.chats) ? st.chats.length : 0;
    if (!confirm(`Restore this backup (${n} chats)? It replaces what's on this phone now.`)) return;
    S = { ...DEFAULTS, ...st };
    save();
    chatId = S.chats[0]?.id ?? null;
    renderSettings();
    renderMsgs();
    toast('Restored.');
  } catch {
    toast('Couldn’t read that file.');
  }
}

/** Once a week (when there's something worth keeping), a nudge to save a backup. */
function renderBackupNudge(): void {
  const box = $('backupNudge');
  const week = 7 * 86_400_000;
  const worth = S.chats.length + S.shifts.length + S.people.length + S.memories.length >= 3;
  const due =
    worth && Date.now() - S.lastBackup > week && Date.now() - S.backupSnooze > 3 * 86_400_000;
  box.hidden = !due;
  box.textContent = '';
  if (!due) return;
  box.appendChild(
    el(
      'span',
      undefined,
      S.lastBackup ? 'It’s been a week since your last backup.' : 'You haven’t saved a backup yet.',
    ),
  );
  const go = el('button', 'btn acc', 'Save one');
  go.onclick = backup;
  const later = el('button', 'btn', 'Later');
  later.onclick = () => {
    S.backupSnooze = Date.now();
    save();
    renderBackupNudge();
  };
  box.append(go, later);
}

/* ── Tomorrow's shift: a card with the wake-up alarm and Alexa buttons ── */
function renderShiftCard(): void {
  const box = $('shiftCard');
  box.textContent = '';
  // At work now: when it ends, how long is left, and when you'll be home.
  const cur = currentShift(S.shifts);
  if (cur && !S.shiftCardsDone.includes(`now:${shiftKey(cur)}`)) {
    box.hidden = false;
    const head = el('div', 'sc-head');
    head.appendChild(el('b', undefined, `At work · ${cur.title}`));
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', 'Hide');
    x.onclick = () => {
      S.shiftCardsDone = [...S.shiftCardsDone, `now:${shiftKey(cur)}`].slice(-60);
      save();
      renderShiftCard();
    };
    head.appendChild(x);
    box.appendChild(head);
    const home = homeBy(cur, S.travel);
    const big = el('div', 'sc-end');
    big.appendChild(el('span', undefined, 'Finish '));
    big.appendChild(el('b', undefined, cur.end.slice(11, 16)));
    big.appendChild(
      el('span', 'muted', ` · ${timeLeft(cur)} left${home ? ` · home by ${home}` : ''}`),
    );
    box.appendChild(big);
    return;
  }
  const n = nextShift(S.shifts);
  if (!n || S.shiftCardsDone.includes(shiftKey(n.shift))) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const s = n.shift;
  const alarm = alarmFor(s, S.shiftRules, S.shiftLead);
  const day =
    n.when === 'today'
      ? 'Today'
      : n.when === 'tomorrow'
        ? 'Tomorrow'
        : describeShift(s).slice(0, 10);
  const head = el('div', 'sc-head');
  head.appendChild(el('b', undefined, `${day} · ${s.title}`));
  const go = leaveBy(s, S.travel);
  head.appendChild(
    el(
      'span',
      'muted',
      ` ${s.start.slice(11, 16)}–${s.end.slice(11, 16)}${go ? ` · leave by ${go}` : ''}`,
    ),
  );
  box.appendChild(head);
  const home = homeBy(s, S.travel);
  const fin = el('div', 'sc-end');
  fin.appendChild(el('span', undefined, 'Finish '));
  fin.appendChild(el('b', undefined, s.end.slice(11, 16)));
  if (s.end.slice(0, 10) !== s.start.slice(0, 10))
    fin.appendChild(el('span', 'muted', ' next day'));
  if (home) fin.appendChild(el('span', 'muted', ` · home by ${home}`));
  const x = el('button', 'x', '✕');
  x.setAttribute('aria-label', 'Hide until the next shift');
  x.onclick = () => {
    S.shiftCardsDone = [...S.shiftCardsDone, shiftKey(s)].slice(-60);
    save();
    renderShiftCard();
  };
  head.appendChild(x);
  box.appendChild(fin);
  const row = el('div', 'sc-row');
  if (android) {
    const phone = el('a', 'btn acc') as HTMLAnchorElement;
    phone.textContent = `⏰ Phone alarm ${alarm.time}`;
    phone.href = androidAlarmLink(alarm.hour, alarm.minute, `Shift: ${s.title}`.slice(0, 40));
    row.appendChild(phone);
  }
  const lex = el('button', 'btn', `🔊 Tell Alexa ${alarm.time}`);
  const when = n.when === 'later' ? '' : ` ${n.when}`;
  lex.onclick = () => tellAlexa(`set an alarm for ${spokenTime(alarm.time)}${when}`);
  row.appendChild(lex);
  box.appendChild(row);
  box.appendChild(
    el(
      'p',
      'muted sc-tip',
      'The phone button opens Clock with the time filled in: tap Save (Samsung may add it next to your existing alarm). Alarm times: Work › Alarms, pay & travel.',
    ),
  );
}

/* ── Shifts: pick screenshots of the rota, then Alton reads them ── */
const SHIFTS_TEXT = 'Add these shifts to my calendar';
function askForShifts(pick = true): void {
  const ta = $<HTMLTextAreaElement>('msg');
  ta.value = SHIFTS_TEXT;
  toast('Pick screenshots of your rota (or share them from your shift app).');
  if (pick) $('photo').click();
}

/* ── Spending bar under the header: this month's Claude spend on this phone ── */
function renderSpend(): void {
  const u = summarise(S.usage, S.budget);
  const lvl = spendLevel(u.month, S.budget);
  const t = $('spendText');
  t.textContent = `· ${S.saver ? '🍃 ' : ''}${fmtUsd(u.month)}${S.budget > 0 ? ` / ${fmtUsd(S.budget)}` : ''} this month`;
  t.className = lvl.tone === 'ok' ? '' : lvl.tone;
  const bar = $('spendBar');
  bar.hidden = !(S.budget > 0);
  bar.className = `spendbar${lvl.tone === 'ok' ? '' : ` ${lvl.tone}`}`;
  $('spendFill').style.width = `${Math.max(2, lvl.pct)}%`;
}

/* ── The PC connection: off (phone only), on (reachable, not paired) or paired ── */
type PcLink = 'off' | 'on' | 'paired';
let pcLink: PcLink = 'off';
let pcStatus: PcStatus | null = null;
/** Why the PC isn't connected ('' when it is). */
let pcWhy = '';
const TOKEN_KEY = 'alton-pc-token';
const pcBase = (): string => S.pcHttps.replace(/\/+$/, '');
const pcToken = (): string => ls.get(TOKEN_KEY) ?? '';
function conn(): PcConn | null {
  return pcLink === 'paired' ? { base: pcBase(), token: pcToken() } : null;
}
const usePcNow = (): boolean => S.usePc && pcLink === 'paired';
async function checkPc(): Promise<void> {
  const base = pcBase();
  if (!base) {
    pcWhy = 'Add your PC’s Tailscale address above, then the pairing code.';
    return setLink('off');
  }
  if (!isPcAddress(base)) {
    pcWhy = 'The address should look like https://palpatine.tail1234.ts.net';
    return setLink('off');
  }
  const tok = pcToken();
  if (tok) {
    try {
      pcStatus = await pcApi<PcStatus>({ base, token: tok }, 'GET', '/api/status', undefined, 6000);
      pcWhy = '';
      if (pcStatus.name && pcStatus.name !== S.pcName) {
        S.pcName = pcStatus.name;
        save();
      }
      return setLink('paired');
    } catch (e) {
      if (e instanceof PcError && e.status === 401) {
        ls.del(TOKEN_KEY);
        pcWhy = 'The PC no longer knows this phone. Connect again with a new code.';
      }
    }
  }
  try {
    const r = await fetch(`${base}/api/ping`, {
      cache: 'no-store',
      signal: AbortSignal.timeout?.(5000),
    });
    const j = (await r.json().catch(() => ({}))) as { version?: string };
    if (j.version && j.version !== S.pcVersion) {
      S.pcVersion = j.version;
      save();
    }
    if (!pcToken()) pcWhy = 'Your PC is on. Connect this phone with a code from the PC.';
    else if (!pcWhy) pcWhy = 'Your PC is on but didn’t answer properly. Try Check now.';
    return setLink(r.ok ? 'on' : 'off');
  } catch {
    // Some browsers block reading the answer; a plain "is anything there?" still works.
    try {
      await fetch(`${base}/api/ping`, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout?.(5000),
      });
      pcWhy =
        'Your PC is on, but this browser can’t talk to it directly. Install the latest Alton on the PC; if the browser asks to allow devices on your network, allow it.';
      return setLink('on');
    } catch (e2) {
      const err = e2 as Error;
      pcWhy =
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'No answer. Is Tailscale on (on both), and is the PC on with Alton running?'
          : 'Couldn’t reach the PC. Check Tailscale is on on both.';
      return setLink('off');
    }
  }
}
function setLink(l: PcLink): void {
  const was = pcLink;
  pcLink = l;
  const chip = $('pcChip');
  chip.className = `pcchip${l === 'paired' ? ' on' : l === 'on' ? ' half' : ''}`;
  const label = chip.querySelector('span');
  if (label)
    label.textContent =
      l === 'paired'
        ? `${S.pcName || 'PC'} connected`
        : l === 'on'
          ? 'PC on · tap to connect'
          : 'Phone only';
  if (l === 'paired' && (was !== 'paired' || Date.now() - S.lastPcSync > 3 * 60_000))
    void syncWithPc();
  if (view === 'pc') renderPc();
  if (view === 'today') renderToday();
}

/* ── Live sync: send what changed here, then take the PC's latest ── */
let syncing = false;
async function syncWithPc(manual = false): Promise<void> {
  sendPcLink(true);
  const c = conn();
  if (!c) {
    if (manual) toast(pcWhy || 'Not connected to the PC.');
    return;
  }
  if (syncing) return;
  syncing = true;
  try {
    const since = Date.now();
    const n = {
      m: S.newMemories.length,
      i: S.newListItems.length,
      o: S.listOps.length,
      t: S.newNotes.length,
    };
    const chats = chatsToSend(S.chats, S.lastExport);
    const shifts = upcomingShifts(S.shifts);
    const sk = JSON.stringify(shifts);
    const sendShifts = sk !== S.shiftsSent && shifts.length > 0;
    const phone = await phoneStatusNow();
    const pk = JSON.stringify({ ...phone, at: 0 });
    const sendPhone = pk !== lastPhoneSent;
    if (chats.length || n.m || n.i || n.o || n.t || sendShifts || sendPhone) {
      const data: SyncToPc = {
        v: 1,
        chats,
        memories: S.newMemories.slice(0, n.m),
        listItems: S.newListItems.slice(0, n.i),
        listOps: S.listOps.slice(0, n.o),
        notes: S.newNotes.slice(0, n.t),
        ...(sendShifts ? { shifts } : {}),
        phone,
      };
      await pcApi(c, 'POST', '/api/import', { data }, 30_000);
      lastPhoneSent = pk;
      // Anything added while that was on its way stays for next time.
      S.newMemories = S.newMemories.slice(n.m);
      S.newListItems = S.newListItems.slice(n.i);
      S.listOps = S.listOps.slice(n.o);
      S.newNotes = S.newNotes.slice(n.t);
      S.lastExport = since;
      if (sendShifts) S.shiftsSent = sk;
      save();
    }
    const r = await pcApi<{ payload: SyncFromPc }>(
      c,
      'GET',
      `/api/sync?pc=${encodeURIComponent(c.base)}`,
      undefined,
      30_000,
    );
    applyFromPc(r.payload);
    applyLook();
    if (view === 'chat') renderMsgs();
    else setView(view);
    if (manual) toast('Synced with your PC.');
  } catch (e) {
    if (e instanceof PcError && e.status === 401) {
      ls.del(TOKEN_KEY);
      void checkPc();
    }
    if (manual) toast(`Couldn’t sync: ${(e as Error).message}`);
  } finally {
    syncing = false;
  }
}

/* ── Chats through the PC's Alton (full tools, the PC's key) ── */
const pcChatsSent = new Set<string>();
async function askPc(chat: PhoneChat, imgs: Array<{ data: string; thumb: string }>): Promise<void> {
  const c = conn();
  const last = chat.messages[chat.messages.length - 1];
  if (!c || !last)
    return ask(
      chat,
      imgs.map((i) => i.data),
    );
  const ctrl = new AbortController();
  busy = ctrl;
  setSending(true);
  renderMsgs(`Asking ${S.pcName || 'your PC'}…`);
  let reply: PhoneMessage | null = null;
  try {
    // Make sure the PC has this chat's earlier messages (it finds them by this phone's id).
    const earlier = chat.messages.slice(0, -1).filter((m) => !m.pc);
    if (!pcChatsSent.has(chat.id) || earlier.some((m) => m.at > S.lastExport)) {
      const data: SyncToPc = {
        v: 1,
        chats: [{ ...chat, messages: earlier }],
        memories: [],
        listItems: [],
      };
      await pcApi(c, 'POST', '/api/import', { data }, 20_000);
      pcChatsSent.add(chat.id);
    }
    const r = await pcApi<{ jobId: string }>(
      c,
      'POST',
      '/api/send',
      {
        text: last.text,
        chatId: chat.id,
        research: chat.research,
        images: imgs.map((i, k) => ({ name: `photo${k + 1}.jpg`, data: i.data, thumb: i.thumb })),
      },
      60_000,
    );
    last.pc = true;
    reply = { role: 'assistant', text: '', at: Date.now(), sources: [], pc: true };
    chat.messages.push(reply);
    let fails = 0;
    for (;;) {
      if (ctrl.signal.aborted) {
        void pcApi(c, 'POST', '/api/cancel', {}).catch(() => undefined);
        break;
      }
      await new Promise((res) => setTimeout(res, 500));
      let j: PcJob;
      try {
        j = await pcApi<PcJob>(
          c,
          'GET',
          `/api/job/${encodeURIComponent(r.jobId)}`,
          undefined,
          8000,
        );
        fails = 0;
      } catch (e) {
        if ((e instanceof PcError && e.status === 404) || ++fails > 30) throw e;
        continue;
      }
      reply.text = j.text;
      reply.sources = j.sources ?? [];
      renderMsgs(j.text ? undefined : j.activity || 'Thinking…');
      if (j.done) {
        if (j.error) reply.text = `${reply.text}${reply.text ? '\n\n' : ''}_${j.error}_`;
        break;
      }
    }
  } catch (err) {
    if (!reply) {
      // Couldn't hand it to the PC: ask Claude from the phone instead.
      busy = null;
      setSending(false);
      void checkPc();
      toast('Couldn’t reach your PC, so I asked from the phone.');
      return ask(
        chat,
        imgs.map((i) => i.data),
      );
    }
    reply.text = `${reply.text}${reply.text ? '\n\n' : ''}_Lost the connection to the PC (${(err as Error).message})._`;
  }
  busy = null;
  setSending(false);
  if (!reply.text) reply.text = '_(stopped)_';
  chat.updatedAt = Date.now();
  save();
  renderMsgs();
  if (driving) return driveAfterReply(reply);
  if (handsFree) say(reply.text, true, () => handsFree && !busy && toggleMic());
  else say(reply.text);
}

/* ── Updates: GitHub Pages has a newer build than this one ── */
let newVersion = '';
const newer = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};
/** The Android app: newest release that already has its APK (GitHub's API allows this). */
let apkUrl = __APK_URL__;
async function checkAppUpdate(manual: boolean): Promise<void> {
  try {
    const r = await fetch(`https://api.github.com/repos/${__REPO__}/releases/latest`, {
      cache: 'no-store',
      headers: { accept: 'application/vnd.github+json' },
    });
    const j = (await r.json()) as {
      tag_name?: string;
      assets?: Array<{ name: string; browser_download_url: string }>;
    };
    const v = (j.tag_name ?? '').replace(/^v/, '');
    const apk = j.assets?.find((a) => a.name === 'Alton.apk');
    if (v && apk && newer(v, __APP_VERSION__)) {
      newVersion = v;
      apkUrl = apk.browser_download_url;
      $('updVer').textContent = v;
      $('updateBar').hidden = false;
      if (manual) $('updMsg').textContent = `Version ${v} is ready: tap the banner at the top.`;
    } else if (manual)
      $('updMsg').textContent =
        v && newer(v, __APP_VERSION__)
          ? `Version ${v} is still being built. Try again in a few minutes.`
          : 'You’re on the latest version. ✓';
  } catch {
    if (manual) $('updMsg').textContent = 'Couldn’t check (no signal?).';
  }
  renderAbout();
}
async function checkUpdate(manual = false): Promise<void> {
  if (isApp) return checkAppUpdate(manual);
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    const j = (await r.json()) as { version?: string };
    if (j.version && newer(j.version, __APP_VERSION__)) {
      newVersion = j.version;
      $('updVer').textContent = j.version;
      $('updateBar').hidden = false;
      if (manual)
        $('updMsg').textContent = `Version ${j.version} is ready: tap the banner at the top.`;
    } else if (manual) $('updMsg').textContent = 'You’re on the latest version. ✓';
  } catch {
    if (manual) $('updMsg').textContent = 'Couldn’t check (no signal?).';
  }
  renderAbout();
}
async function applyUpdate(): Promise<void> {
  if (isApp) {
    // A new app version is a new APK: Alton downloads it and opens the Install screen.
    toast('Downloading the update…');
    try {
      await Native.installUpdate({ url: apkUrl });
      toast('Tap Install to finish updating.');
    } catch (e) {
      const m = (e as Error).message;
      if (m.startsWith('ALLOW: ')) toast(m.slice(7));
      else {
        // Fall back to the browser download.
        toast(`${m} Downloading it in the browser instead.`);
        location.href = apkUrl;
      }
    }
    return;
  }
  $('updateBar').textContent = 'Updating…';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    reg?.waiting?.postMessage('skip-waiting');
    // The old copy of the page must not be used again.
    for (const k of await caches.keys()) if (k.startsWith('alton-v')) await caches.delete(k);
  } catch {
    /* reload anyway */
  }
  location.reload();
}
function renderAbout(): void {
  const apk = $<HTMLAnchorElement>('getApk');
  apk.hidden = isApp || !android;
  apk.href = __APK_URL__;
  $('aboutVer').textContent =
    `${isApp ? 'Android app' : 'Phone app'} ${__APP_VERSION__}${newVersion ? ` (update ${newVersion} ready)` : ''}${
      S.pcVersion ? ` · PC Alton ${S.pcVersion}` : ''
    }`;
}

/* ── Alton's voice: the PC's Fish Audio voice when possible, else the phone's ── */
const FISH_KEY = 'alton-fish-key';
async function fishDirect(text: string): Promise<Blob | null> {
  const key = ls.get(FISH_KEY);
  if (!key) {
    voiceNote = 'No Fish Audio key saved on this phone.';
    return null;
  }
  const voiceId = S.fishVoiceId || S.pcVoice?.fishVoiceId || DEFAULT_FISH_VOICE;
  const m = S.pcVoice?.fishModel ?? '';
  const model: FishModel = (FISH_MODELS as readonly string[]).includes(m)
    ? (m as FishModel)
    : 's2.1-pro-free';
  const { url, init } = fishRequest(key, text, voiceId, model);
  if (isApp) {
    // Native request (Fish Audio doesn't allow browser requests).
    const r = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers: init.headers,
      data: JSON.parse(init.body) as Record<string, unknown>,
      responseType: 'blob',
    });
    if (r.status !== 200 || typeof r.data !== 'string') {
      voiceNote = fishError(r.status, typeof r.data === 'string' ? r.data.slice(0, 200) : '');
      return null;
    }
    const bin = atob(r.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'audio/mpeg' });
  }
  const r = await fetch(url, init);
  if (!r.ok) voiceNote = fishError(r.status, '');
  return r.ok ? r.blob() : null;
}
/** Why the last attempt at the Fish voice didn't work (shown by "Test the voice"). */
let voiceNote = '';
async function voiceAudio(text: string): Promise<Blob | null> {
  const src = S.voiceSource;
  voiceNote = '';
  if (src === 'phone') return null;
  const c = conn();
  if ((src === 'auto' || src === 'pc') && c && S.pcVoice?.engine === 'fish') {
    try {
      const r = await fetch(`${c.base}/api/tts`, {
        method: 'POST',
        headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) return await r.blob();
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      voiceNote = `Your PC said: ${j.error ?? r.status}`;
    } catch {
      voiceNote = 'Couldn’t reach your PC for its voice.';
    }
  } else if (src === 'pc')
    voiceNote = !c
      ? 'Not connected to your PC right now.'
      : 'Your PC isn’t using a Fish Audio voice (update the PC to 0.31 or newer and connect again).';
  if (src === 'auto' || src === 'fish') {
    try {
      return await fishDirect(text);
    } catch (e) {
      voiceNote = `Fish Audio couldn’t be reached (${(e as Error).message}).`;
      return null;
    }
  }
  return null;
}
function renderVoiceSource(): void {
  $<HTMLSelectElement>('voiceSrc').value = S.voiceSource;
  const v = S.pcVoice;
  $('voiceSrcInfo').textContent = !v
    ? 'Connect to your PC once so Alton knows which voice it uses.'
    : v.engine === 'fish'
      ? `Your PC speaks with a Fish Audio voice. Through the PC it works whenever you're connected; with your own Fish key on this phone it works anywhere${ls.get(FISH_KEY) ? ' (key saved ✓)' : ''}.`
      : `Your PC uses a Windows voice${v.name ? ` (${v.name})` : ''}, which can't be copied to a phone. Pick the closest one above, or set up a Fish Audio voice on the PC to share it.`;
  $('fishKeyRow').hidden = S.voiceSource === 'phone' || S.voiceSource === 'pc';
  const saved = ls.get(FISH_KEY) ?? '';
  $('fishKeyState').textContent = saved
    ? `Key saved ✓ (ends in …${saved.slice(-4)})`
    : 'No key saved yet.';
  $('fishKeyForget').hidden = !saved;
  const vid = $<HTMLInputElement>('fishVoice');
  if (document.activeElement !== vid) vid.value = S.fishVoiceId;
  vid.placeholder = S.pcVoice?.fishVoiceId || DEFAULT_FISH_VOICE;
}
function wireVoiceSource(): void {
  setAudioVoice(voiceAudio);
  $<HTMLSelectElement>('voiceSrc').onchange = (e) => {
    S.voiceSource = (e.target as HTMLSelectElement).value as State['voiceSource'];
    save();
    renderVoiceSource();
  };
  $('fishKeySave').onclick = () => {
    const k = $<HTMLInputElement>('fishKey').value.trim();
    if (k.length < 20) return toast('That doesn’t look like a Fish Audio API key.');
    const voiceIds = [S.fishVoiceId, S.pcVoice?.fishVoiceId, DEFAULT_FISH_VOICE];
    if (voiceIds.includes(k))
      return toast('That’s a voice ID, not your API key. The key is on fish.audio › API Keys.');
    ls.set(FISH_KEY, k);
    $<HTMLInputElement>('fishKey').value = '';
    renderVoiceSource();
    toast('Saved on this phone only.');
  };
  $('fishKeyForget').onclick = () => {
    ls.del(FISH_KEY);
    renderVoiceSource();
    toast('Key removed from this phone.');
  };
  $<HTMLInputElement>('fishVoice').onchange = (e) => {
    S.fishVoiceId = (e.target as HTMLInputElement).value.trim().replace(/^.*\//, '').slice(0, 64);
    save();
  };
  $('voiceTest').onclick = async () => {
    stopSpeaking();
    const line = `Hello${S.userName ? ` ${S.userName}` : ''}, this is ${S.name}.`;
    if (S.voiceSource === 'phone') {
      speak(line, { rate: S.voiceRate || 1, voice: S.voiceName });
      return;
    }
    $('voiceTestMsg').textContent = 'Getting the voice…';
    const blob = await voiceAudio(line);
    if (!blob) {
      $('voiceTestMsg').textContent = `Using the phone’s voice instead. ${voiceNote}`;
      setAudioVoice(null);
      speak(line, { rate: S.voiceRate || 1, voice: S.voiceName });
      setAudioVoice(voiceAudio);
      return;
    }
    $('voiceTestMsg').textContent = 'That’s your Fish Audio voice ✓';
    speak(line, { rate: S.voiceRate || 1, voice: S.voiceName });
  };
}

/* ── Home-screen widget (Android app): next shift, weather, next reminder ── */
let widgetPlace = '';
async function placeName(lat: number, lon: number): Promise<string> {
  try {
    const j = (await (
      await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&lat=${lat}&lon=${lon}`,
        {
          headers: { 'accept-language': 'en' },
        },
      )
    ).json()) as { address?: Record<string, string> };
    const a = j.address ?? {};
    return a.suburb ?? a.village ?? a.town ?? a.city_district ?? a.city ?? '';
  } catch {
    return '';
  }
}
async function updateWidget(): Promise<void> {
  if (!isApp) return;
  const hm = (d: Date): string => d.toTimeString().slice(0, 5);
  const cur = currentShift(S.shifts);
  const next = upcomingShifts(S.shifts).find((x) => x !== cur);
  let line1: string;
  if (cur) line1 = `At work · ${cur.title} until ${cur.end.slice(11, 16)}`;
  else if (next) {
    const lb = leaveBy(next, S.travel);
    line1 = `${describeShift(next)}${lb ? ` · leave by ${lb}` : ''}`;
  } else line1 = 'No shifts coming up';
  const w = nowWeather;
  const today = w?.days[0];
  const line2 = w
    ? `${wxIcon(w.code, w.isDay)} ${Math.round(w.temp)}° ${WMO[w.code] ?? ''}${today ? ` · ${Math.round(today.hi)}°/${Math.round(today.lo)}°` : ''}`
    : '';
  const rem = S.reminders.filter((r) => r.at > Date.now()).sort((a, b) => a.at - b.at)[0];
  const line3 = rem
    ? `⏰ ${new Date(rem.at).toLocaleDateString() === new Date().toLocaleDateString() ? '' : `${new Date(rem.at).toLocaleDateString([], { weekday: 'short' })} `}${hm(new Date(rem.at))} ${rem.what}`
    : `Updated ${hm(new Date())}`;
  const f = lastFix;
  if (f && !widgetPlace) widgetPlace = await placeName(f.lat, f.lon);
  await Native.setWidget({
    title: S.name.toUpperCase(),
    line1,
    line2,
    line3,
    shift: next ? `💼 ${next.title} · ${describeShift(next).replace(/ \(.*$/, '')}` : '',
    user: (S.userName || '').split(' ')[0] ?? '',
    place: widgetPlace,
    ...(f ? { lat: f.lat, lon: f.lon } : {}),
  }).catch(() => undefined);
}

/* ── Notifications (reminders + watch heads-ups) that buzz the phone and a paired watch ── */
let watchExtras: {
  at: number;
  forecast: Record<string, string>;
  events: Array<{ title: string; start: number; allDay?: boolean }>;
  hourly: HourWeather[];
} | null = null;
async function morningExtras(): Promise<NonNullable<typeof watchExtras>> {
  if (watchExtras && Date.now() - watchExtras.at < 3 * 3600_000) return watchExtras;
  const forecast: Record<string, string> = {};
  const hourly: HourWeather[] = [];
  let events: Array<{ title: string; start: number; allDay?: boolean }> = [];
  try {
    const f = lastFix ?? (await locate());
    if (f) {
      const j = (await (
        await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${f.lat}&longitude=${f.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=precipitation_probability,temperature_2m,weather_code&timezone=auto&forecast_days=4`,
        )
      ).json()) as {
        hourly?: {
          time: string[];
          precipitation_probability: number[];
          temperature_2m: number[];
          weather_code: number[];
        };
        daily?: {
          time: string[];
          weather_code: number[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          precipitation_probability_max: number[];
        };
      };
      const hh = j.hourly;
      hh?.time.forEach((t, i) =>
        hourly.push({
          t: new Date(t).getTime(),
          rain: hh.precipitation_probability[i] ?? 0,
          temp: hh.temperature_2m[i] ?? 10,
          code: hh.weather_code[i] ?? 0,
        }),
      );
      const d = j.daily;
      d?.time.forEach((day, i) => {
        const rain = d.precipitation_probability_max[i] ?? 0;
        forecast[day] =
          `${WMO[d.weather_code[i] ?? 0] ?? 'weather'}, ${Math.round(d.temperature_2m_min[i] ?? 0)}–${Math.round(d.temperature_2m_max[i] ?? 0)}°C${rain >= 40 ? `, ${rain}% rain` : ''}`;
      });
    }
  } catch {
    /* no forecast this time */
  }
  try {
    if ((await powerStatus())?.calendar) {
      const from = Date.now();
      events = (await Native.calendarEvents({ from, to: from + 4 * 86_400_000 })).events;
    }
  } catch {
    /* no calendar */
  }
  watchExtras = { at: Date.now(), forecast, events, hourly };
  return watchExtras;
}
async function scheduleWatch(): Promise<void> {
  if (!isApp) return;
  const notes = S.reminders
    .filter((r) => r.at > Date.now())
    .map((r) => ({
      id: noteId(`rem:${r.at}:${r.what}`),
      title: `Alton · ${r.what}`,
      body: 'Reminder',
      at: r.at,
    }));
  const extras = S.watchMorning || S.watchLeaveWx ? await morningExtras() : undefined;
  const pay = payInfo();
  const items = workItems(S.lists, S.workLists);
  const ups = planHeadsUps(
    S.shifts,
    {
      shiftEve: S.watchEve,
      eveHour: S.eveHour,
      leave: S.watchLeave,
      travel: S.travel,
      morning: S.watchMorning,
      morningHour: S.morningHour,
      alarmRules: S.shiftRules,
      alarmLead: S.shiftLead,
      ...(S.sleepOn ? { sleep: { hours: S.sleepHours, windDown: S.windDown } } : {}),
      shiftLeft: S.watchShiftLeft,
      breakAfter: S.breakAfter,
      leaveWeather: S.watchLeaveWx,
      payday: S.watchPayday,
      summary: S.watchSummary,
      endLead: S.workEndLead,
    },
    new Date(),
    {
      ...(extras ?? {}),
      ...(pay ? { payday: { date: pay.day, net: pay.net } } : {}),
      items,
      reminders: S.reminders,
    },
  );
  // Leave-by with a "Running late" button goes through the app's own alarm (so the button can
  // send the text without opening Alton); everything else is a normal notification.
  const late = lateNumber();
  // Through the app's own alarm: leave-by with "Running late", and the end-of-shift summary
  // (so the messages that came in during the shift are added when it fires).
  const nativeUps = isApp
    ? ups.filter((u) => (late && u.key.startsWith('leave:')) || u.key.startsWith('end:'))
    : [];
  for (const u of ups)
    if (!nativeUps.includes(u))
      notes.push({ id: noteId(u.key), title: u.title, body: u.body, at: u.at });
  void Native.scheduleLate({
    items: nativeUps.map((u) => ({
      id: noteId(u.key),
      at: u.at,
      title: u.title,
      body: u.body,
      late: u.key.startsWith('leave:'),
      msgs: u.key.startsWith('end:'),
    })),
    to: late,
    text: S.lateText,
    name: S.lateTo,
  }).catch(() => undefined);
  // The end-of-shift summary already has the list: no separate "Before you leave".
  if (S.workEnd && !S.watchSummary)
    for (const u of shiftEndNotes(
      S.shifts,
      workItems(S.lists, S.workLists),
      S.workName || 'work',
      S.workEndLead,
    ))
      notes.push({ id: noteId(u.key), title: u.title, body: u.body, at: u.at });
  await scheduleNotes(notes);
  void updateWidget();
}
/** The number for "Running late": a saved person's number, or the number typed in. */
function lateNumber(): string {
  const who = S.lateTo.trim();
  if (!who || !S.lateText.trim()) return '';
  if (/^\+?[\d\s()-]{7,}$/.test(who)) return who.replace(/[^\d+]/g, '');
  const p = S.people.find((x) => x.name.toLowerCase() === who.toLowerCase());
  return p?.phone ? p.phone.replace(/[^\d+]/g, '') : '';
}
/** Rota changes straight to the watch, after shifts are read (shift app, screenshot, calendar,
 *  the read while charging). */
function alertRotaChanges(before: Shift[], incoming: Shift[]): void {
  if (!isApp || !S.watchRota || !incoming.length) return;
  for (const n of rotaChangeNotes(rotaChanges(before, incoming)))
    void notifyNow(noteId(n.key), n.title, n.body);
}
/** Battery, unread messages and the next payday, for the PC's desktop widget and tray. */
let lastPhoneSent = '';
async function phoneStatusNow(): Promise<NonNullable<SyncToPc['phone']>> {
  let battery: number | null = null;
  let charging = false;
  try {
    const b = await (
      navigator as Navigator & { getBattery?(): Promise<{ level: number; charging: boolean }> }
    ).getBattery?.();
    if (b) {
      battery = Math.round(b.level * 100);
      charging = b.charging;
    }
  } catch {
    /* no battery info */
  }
  let unread = 0;
  if (isApp && (await powerStatus())?.messages)
    unread = await Native.getMessages()
      .then((r) => r.messages.length)
      .catch(() => 0);
  const pd = payInfo();
  return {
    // Rounded to 5 % so small changes don't resend.
    battery: battery === null ? null : Math.round(battery / 5) * 5,
    charging,
    unread,
    autoSend: S.autoMessages,
    payday: pd ? { date: pd.day, net: Math.round(pd.net) } : null,
    at: Date.now(),
  };
}
function renderWatch(): void {
  for (const [id, on] of [
    ['wEve', S.watchEve],
    ['wLeave', S.watchLeave],
    ['wMorning', S.watchMorning],
    ['wRota', S.watchRota],
    ['wShiftLeft', S.watchShiftLeft],
    ['wLeaveWx', S.watchLeaveWx],
    ['wPayday', S.watchPayday],
    ['wSummary', S.watchSummary],
  ] as const) {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  }
  $<HTMLInputElement>('wEveHour').value = String(S.eveHour);
  $<HTMLInputElement>('wMorningHour').value = String(S.morningHour);
  $<HTMLInputElement>('wBreak').value = S.breakAfter ? String(S.breakAfter) : '';
  $<HTMLInputElement>('wLateTo').value = S.lateTo;
  $<HTMLInputElement>('wLateText').value = S.lateText;
  $('wLateNote').textContent = S.lateTo
    ? lateNumber()
      ? `Tap “Running late” on the leave heads-up to text ${S.lateTo}. Needs permission to send texts.`
      : `No number for “${S.lateTo}”: type a number, or save them in Lists › People with a number.`
    : 'Optional: a “Running late” button on the leave heads-up.';
  $('wLeaveNote').textContent = S.travel
    ? `${S.travel} min journey (from Work › Alarms, pay & travel)`
    : 'Set “Travel to work” in Work › Alarms, pay & travel first';
}
function wireWatch(): void {
  if (!isApp) return;
  for (const [id, key] of [
    ['wEve', 'watchEve'],
    ['wLeave', 'watchLeave'],
    ['wMorning', 'watchMorning'],
    ['wRota', 'watchRota'],
    ['wShiftLeft', 'watchShiftLeft'],
    ['wLeaveWx', 'watchLeaveWx'],
    ['wPayday', 'watchPayday'],
    ['wSummary', 'watchSummary'],
  ] as const)
    $(id).onclick = () => {
      S[key] = !S[key];
      save();
      renderWatch();
      void scheduleWatch();
    };
  for (const [id, key] of [
    ['wEveHour', 'eveHour'],
    ['wMorningHour', 'morningHour'],
  ] as const)
    $<HTMLInputElement>(id).onchange = (e) => {
      S[key] = Math.min(
        23,
        Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)),
      );
      save();
      void scheduleWatch();
    };
  $<HTMLInputElement>('wBreak').onchange = (e) => {
    const v = Math.round(Number((e.target as HTMLInputElement).value) || 0);
    S.breakAfter = v > 0 && v < 720 ? v : 0;
    save();
    renderWatch();
    void scheduleWatch();
  };
  for (const [id, key] of [
    ['wLateTo', 'lateTo'],
    ['wLateText', 'lateText'],
  ] as const)
    $<HTMLInputElement>(id).onchange = (e) => {
      S[key] = (e.target as HTMLInputElement).value.trim().slice(0, 160);
      save();
      renderWatch();
      void scheduleWatch();
    };
  $('wTest').onclick = () => {
    void scheduleNotes([]).then(() =>
      scheduleNotes([
        {
          id: noteId('test'),
          title: 'Alton · test',
          body: 'If your watch buzzed, heads-ups will reach it.',
          at: Date.now() + 8000,
        },
      ]),
    );
    toast('A test notification comes in about 8 seconds: lock the phone and check your watch.');
    setTimeout(() => void scheduleWatch(), 15_000);
  };
  // Keep them up to date while Alton is open (new shifts, a fresh forecast).
  void scheduleWatch();
  setInterval(() => void scheduleWatch(), 60 * 60_000);
}

/* ── Reading new messages out loud (Android app; works with Alton closed) ── */
function sendAnnounce(): void {
  if (!isApp) return;
  void Native.setAnnounce({
    mode: S.announce,
    quietFrom: S.quietFrom,
    quietTo: S.quietTo,
    rate: S.voiceRate || 1,
    favs: S.msgFavs,
  }).catch(() => undefined);
}
/** Tell the native side where to send new messages (works with Alton closed). */
function sendPcLink(poll = false): void {
  if (!isApp) return;
  const c = conn();
  void Native.setPcLink({
    base: c?.base ?? '',
    token: c?.token ?? '',
    on: S.msgToPc && !!c,
    poll,
  }).catch(() => undefined);
}

/* ── Messages: status and step log, summaries, "while you were away" ── */
function toPhoneMsgs(list: AppMessage[]): PhoneMsg[] {
  return list.map((m) => ({
    id: m.id,
    app: m.app,
    from: m.from,
    chat: m.chat ?? '',
    text: m.text,
    at: m.at,
    canReply: m.canReply,
  }));
}
async function renderMsgStatus(): Promise<void> {
  if (!isApp) return;
  try {
    const st = await Native.messagesStatus();
    $('msgState').textContent = !st.enabled
      ? '❌ Notification access is off: tap “Read & reply to messages” in Phone access (if Android says “Restricted setting”, use the button there first).'
      : !st.connected
        ? '⚠️ Access is on but Android has stopped Alton’s listener. Alton asked it to reconnect: check again in a minute, or turn the access off and on.'
        : `✅ Listening for messages${S.announce === 'off' ? ' · reading aloud is OFF (choose below)' : ''}${st.pc ? ' · sending to your PC' : ''}`;
    $('msgLog').textContent =
      st.log || 'Nothing yet: messages and decisions show here as they arrive.';
  } catch {
    $('msgState').textContent = 'Update the Android app to see this.';
  }
}
function wireMessages(): void {
  if (!isApp) return;
  $<HTMLInputElement>('msgFavs').value = S.msgFavs.join(', ');
  $<HTMLInputElement>('msgFavs').onchange = (e) => {
    S.msgFavs = (e.target as HTMLInputElement).value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
    save();
    sendAnnounce();
  };
  for (const [id, key] of [
    ['msgToPcT', 'msgToPc'],
    ['catchupT', 'catchupPhone'],
  ] as const) {
    const b = $(id);
    const paint = (): void => {
      b.classList.toggle('on', S[key]);
      b.textContent = S[key] ? '✓' : '';
    };
    paint();
    b.onclick = () => {
      S[key] = !S[key];
      save();
      paint();
      sendPcLink();
    };
  }
  $('msgTest').onclick = async () => {
    sendAnnounce();
    const r = await Native.testAnnounce().catch(() => ({
      result: 'Update the Android app first.',
    }));
    toast(r.result);
    void renderMsgStatus();
  };
  $('msgRefresh').onclick = () => void renderMsgStatus();
  $('msgCopy').onclick = async () => {
    const text = `Alton ${__APP_VERSION__} messages log\n${$('msgState').textContent ?? ''}\nRead aloud: ${S.announce} · quiet ${S.quietFrom}–${S.quietTo} · favourites ${S.msgFavs.join(', ') || 'none'} · to PC ${S.msgToPc}\n\n${$('msgLog').textContent ?? ''}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Log copied: paste it into your message.');
    } catch {
      void shareText('Alton messages log', text);
    }
  };
}
/** The newest messages, summarised, for Claude's context ("brief me" includes them). */
let msgDigest = '';
async function refreshMsgDigest(): Promise<void> {
  if (!isApp || !(await powerStatus())?.messages) return;
  const all = await Native.getMessages()
    .then((r) => r.messages)
    .catch(() => [] as AppMessage[]);
  const g = groupMessages(toPhoneMsgs(all));
  msgDigest = g.length ? quickSummary(g) : '';
}
/** Today: "While you were away" after 30+ minutes, with Reply buttons and read-out. */
async function showCatchup(since: number): Promise<void> {
  const card = $('tdAway');
  if (!isApp || !S.catchupPhone) return;
  const all = await Native.getMessages()
    .then((r) => r.messages)
    .catch(() => [] as AppMessage[]);
  const groups = groupMessages(toPhoneMsgs(all.filter((m) => m.at >= since)));
  if (!groups.length) return;
  const box = $('tdAwayList');
  box.textContent = '';
  $('tdAwaySum').textContent = quickSummary(groups);
  for (const g of groups.slice(0, 6)) {
    const row = el('div', 'li');
    const t = el(
      'span',
      undefined,
      `${g.group ? `${g.title}: ` : `${g.title}: `}${g.texts[0] ?? ''}`,
    );
    t.style.flex = '1';
    row.appendChild(t);
    if (g.canReply) {
      const b = el('button', 'btn', 'Reply');
      b.style.padding = '6px 10px';
      b.onclick = async () => {
        const text = prompt(`Reply to ${g.title}:`)?.trim();
        if (!text) return;
        try {
          await Native.replyMessage({ id: g.replyId, text });
          toast(`Sent to ${g.title}.`);
          row.remove();
        } catch (e) {
          toast((e as Error).message);
        }
      };
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  $('tdAwayRead').onclick = () =>
    speak(
      [
        quickSummary(groups),
        ...groups
          .slice(0, 3)
          .filter((g) => !g.group)
          .map((g) => `${g.title} says: ${g.texts[0] ?? ''}`),
      ].join(' '),
    );
  $('tdAwayClose').onclick = () => (card.hidden = true);
  card.hidden = false;
}

/* ── Lock screen: Alton live wallpaper (your picture + small spinning cloud + clock) ── */
function sendWallpaper(): void {
  if (!isApp) return;
  void Native.setWallpaper({
    position: S.lsPos,
    variant: S.lsVariant,
    size: S.lsSize,
    clock: S.lsClock,
    lockOnly: S.lsLockOnly,
    calm: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }).catch(() => undefined);
}
function renderLock(): void {
  $('lockGrp').hidden = !isApp;
  if (!isApp) return;
  $<HTMLSelectElement>('lsVariant').value = S.lsVariant;
  $<HTMLSelectElement>('lsPos').value = S.lsPos;
  $<HTMLSelectElement>('lsSize').value = S.lsSize;
  for (const [id, on] of [
    ['lsClock', S.lsClock],
    ['lsLockOnly', S.lsLockOnly],
  ] as const) {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  }
}
function wireLock(): void {
  if (!isApp) return;
  const set = (ch: Partial<State>): void => {
    S = { ...S, ...ch };
    save();
    renderLock();
    sendWallpaper();
  };
  $<HTMLSelectElement>('lsVariant').onchange = (e) =>
    set({ lsVariant: (e.target as HTMLSelectElement).value as State['lsVariant'] });
  $<HTMLSelectElement>('lsPos').onchange = (e) =>
    set({ lsPos: (e.target as HTMLSelectElement).value as State['lsPos'] });
  $<HTMLSelectElement>('lsSize').onchange = (e) =>
    set({ lsSize: (e.target as HTMLSelectElement).value as State['lsSize'] });
  $('lsClock').onclick = () => set({ lsClock: !S.lsClock });
  $('lsLockOnly').onclick = () => set({ lsLockOnly: !S.lsLockOnly });
  $('lsPick').onclick = () => $('lsFile').click();
  $<HTMLInputElement>('lsFile').onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      await Native.setWallpaperImage({ data: await shrink(f, 2400, 0.9) });
      toast('Picture saved for the lock screen.');
    } catch {
      toast('Couldn’t use that picture.');
    }
  };
  $('lsNoPic').onclick = () =>
    void Native.setWallpaperImage({ data: '' }).then(() =>
      toast('Picture removed (Alton’s dark blue instead).'),
    );
  $('lsSet').onclick = () => {
    sendWallpaper();
    toast('Tap “Set wallpaper” and choose “Lock screen” if it asks (or both).');
    void Native.openWallpaper().catch((err: Error) => toast(err.message));
  };
  sendWallpaper();
}

/* ── Background style and interface options (this phone only) ── */
const BG_KEY = 'alton-bg-photo';
function applyUi(): void {
  const b = document.body;
  if (S.bg === 'aurora' || (S.bg === 'photo' && !ls.get(BG_KEY))) delete b.dataset.bg;
  else b.dataset.bg = S.bg;
  // Space scenes are painted (realistic); the CSS version shows until the painting is ready.
  paintSpace(b, S.bg);
  const photo = ls.get(BG_KEY);
  b.style.setProperty('--bg-photo', photo ? `url("${photo}")` : 'none');
  b.style.setProperty('--bg-dim', String((S.bgDim || 60) / 100));
  const h = document.documentElement;
  h.dataset.text = S.uiText;
  h.dataset.corners = S.uiCorners;
  h.dataset.panels = S.uiPanels;
  h.dataset.chat = S.uiChat;
  h.classList.toggle('compact', S.uiStyle.spacing === 'compact');
  applyUiStyle(h, S.uiStyle);
  h.classList.toggle('scan', S.uiScan);
  applyBgMotion();
}
/* ── Moving background (Settings › Look › Background), over the painted background ── */
let motionStop: (() => void) | null = null;
let motionKey = '';
function applyBgMotion(): void {
  const u = S.uiStyle;
  const level = u.motion === 'off' ? 'off' : u.bgMotion;
  const key = `${S.bg}|${level}|${u.shooting}|${u.parallax}`;
  if (key === motionKey) return;
  motionKey = key;
  motionStop?.();
  motionStop = null;
  let c = document.getElementById('bgMotion') as HTMLCanvasElement | null;
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'bgMotion';
    c.className = 'bg-motion';
    c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
  }
  motionStop = startBgMotion(c, S.bg, {
    level,
    shooting: u.shooting,
    parallax: u.parallax,
    accent: () => {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
      return m ? [m[1], m[2], m[3]].map((x) => parseInt(x ?? '0', 16)).join(',') : '63,208,255';
    },
  });
}
/** Background previews: one small tile per background, drawn with the real thing. */
function renderBgTiles(): void {
  const box = $('bgTiles');
  box.textContent = '';
  const pick = $<HTMLSelectElement>('bgPick');
  for (const o of Array.from(pick.options)) {
    const t = el('button', 'bg-tile');
    t.setAttribute('aria-label', o.text);
    t.classList.toggle('on', S.bg === o.value);
    const art = el('span', 'bg-art');
    art.dataset.bg = o.value;
    t.append(art, el('span', 'bg-label', o.value === 'photo' ? '📷 My picture' : o.text));
    if (isSpaceArt(o.value)) requestAnimationFrame(() => paintSpace(art, o.value, 260));
    t.onclick = () => {
      pick.value = o.value;
      pick.dispatchEvent(new Event('change'));
    };
    box.appendChild(t);
  }
}
function renderUiSettings(): void {
  renderBgTiles();
  $<HTMLSelectElement>('bgPick').value = S.bg;
  $('bgDimRow').hidden = S.bg !== 'photo';
  $<HTMLInputElement>('bgDim').value = String(S.bgDim);
  $<HTMLSelectElement>('uiText').value = S.uiText;
  $<HTMLSelectElement>('uiCorners').value = S.uiCorners;
  $<HTMLSelectElement>('uiPanels').value = S.uiPanels;
  $<HTMLSelectElement>('uiChat').value = S.uiChat;
  renderUiStyle();
  for (const [id, on] of [['uiScan', S.uiScan]] as const) {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  }
}
/** Settings › Look › Interface: font, glass, chat, layout and motion (shared with the PC). */
function renderUiStyle(): void {
  const box = $('uiStyleBox');
  box.textContent = '';
  const change = (ch: Partial<UiStyle>): void => {
    S.uiStyle = cleanUiStyle({ ...S.uiStyle, ...ch });
    S.uiCompact = S.uiStyle.spacing === 'compact';
    save();
    applyUi();
  };
  for (const g of UI_STYLE_GROUPS) {
    box.appendChild(el('h3', 'sub', g.title));
    const grid = el('div', 'steps two');
    for (const f of g.fields) {
      const v = S.uiStyle[f.key];
      if (f.kind === 'toggle') {
        const row = el('div', 'li');
        const name = el('span', undefined, f.label);
        name.style.flex = '1';
        const b = el('button', 'check');
        b.classList.toggle('on', v === true);
        b.textContent = v === true ? '✓' : '';
        b.onclick = () => {
          change({ [f.key]: !(v === true) } as Partial<UiStyle>);
          renderUiStyle();
        };
        row.append(name, b);
        box.appendChild(row);
        continue;
      }
      const lab = el('label', 'muted', f.label);
      if (f.kind === 'select') {
        const sel = el('select', 'input');
        for (const [val, text] of f.options) {
          const o = el('option', undefined, text) as HTMLOptionElement;
          o.value = val;
          sel.appendChild(o);
        }
        sel.value = String(v);
        sel.onchange = () => change({ [f.key]: sel.value } as Partial<UiStyle>);
        lab.appendChild(sel);
      } else {
        const out = el('span', undefined, ` ${String(v)}${f.unit ?? ''}`);
        const r = el('input') as HTMLInputElement;
        r.type = 'range';
        r.min = String(f.min);
        r.max = String(f.max);
        r.step = String(f.step);
        r.value = String(v);
        r.style.width = '100%';
        r.oninput = () => {
          out.textContent = ` ${r.value}${f.unit ?? ''}`;
          change({ [f.key]: Number(r.value) } as Partial<UiStyle>);
        };
        lab.append(out, r);
      }
      grid.appendChild(lab);
    }
    if (grid.childElementCount) box.appendChild(grid);
  }
}
function wireUi(): void {
  const set = (ch: Partial<State>): void => {
    S = { ...S, ...ch };
    save();
    applyUi();
    renderUiSettings();
    renderVoiceSource();
    renderLock();
  };
  $<HTMLSelectElement>('bgPick').onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value as State['bg'];
    if (v === 'photo') $('bgFile').click();
    set({ bg: v });
  };
  $<HTMLInputElement>('bgFile').onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const data = await shrink(f, 1400, 0.8);
      ls.set(BG_KEY, `data:image/jpeg;base64,${data}`);
      set({ bg: 'photo' });
      toast('Background set.');
    } catch {
      toast('Couldn’t use that picture.');
    }
  };
  $<HTMLInputElement>('bgDim').onchange = (e) =>
    set({ bgDim: Number((e.target as HTMLInputElement).value) });
  $<HTMLSelectElement>('uiText').onchange = (e) =>
    set({ uiText: (e.target as HTMLSelectElement).value as State['uiText'] });
  $<HTMLSelectElement>('uiCorners').onchange = (e) =>
    set({ uiCorners: (e.target as HTMLSelectElement).value as State['uiCorners'] });
  $<HTMLSelectElement>('uiPanels').onchange = (e) =>
    set({ uiPanels: (e.target as HTMLSelectElement).value as State['uiPanels'] });
  $<HTMLSelectElement>('uiChat').onchange = (e) =>
    set({ uiChat: (e.target as HTMLSelectElement).value as State['uiChat'] });
  $('uiScan').onclick = () => set({ uiScan: !S.uiScan });
}

/* ── Driving mode: hands-free while Alton is on screen ── */
let driving = false;
let drvRecog: Recog | null = null;
let drvStopAvatar: () => void = () => undefined;
let drvPending: { run: () => Promise<string> } | null = null;
const WAKE = ['alton', 'halton', 'alden', 'elton', 'olton', 'walton', 'all ten', 'alt on'];
/** With music on, only the name itself wakes it (song lyrics can sound like the others). */
const WAKE_STRICT = ['alton', 'halton'];
/** Music playing while driving (checked each time it starts listening). */
let drvMusic = false;
/** Music Alton paused to hear an answer, to start again afterwards. */
let drvResume = false;
function wakeMatch(t: string): string | null {
  const names = [...new Set([S.name.toLowerCase(), ...(drvMusic ? WAKE_STRICT : WAKE)])].map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const m = new RegExp(`^(?:hey |ok |okay )?(?:${names.join('|')})\\b[\\s,.!?]*`, 'i').exec(
    t.trim(),
  );
  return m ? t.trim().slice(m[0].length).trim() : null;
}
const dvStatus = (t: string): void => {
  $('dvStatus').textContent = t;
};
function dvSay(text: string, then: () => void): void {
  drvRecog?.stop();
  dvStatus('Speaking…');
  stopSpeaking();
  speak(plain(text).slice(0, 1500), { rate: S.voiceRate || 1, voice: S.voiceName, onend: then });
}
function driveListen(needWake: boolean): void {
  if (!driving) return;
  if (busy || isSpeaking()) {
    setTimeout(() => driveListen(needWake), 700);
    return;
  }
  // Music on: it would hear the song as an answer. Waiting for "Alton…" it just listens for the
  // name; waiting for an answer ("send it?"), it pauses the music until you've spoken.
  void Native.musicActive()
    .then((m) => m.active)
    .catch(() => false)
    .then(async (active) => {
      drvMusic = active;
      if (active && !needWake) {
        await Native.media({ action: 'pause' }).catch(() => undefined);
        drvResume = true;
        drvMusic = false;
      }
      if (driving) driveStart(needWake);
    });
}
function driveStart(needWake: boolean): void {
  const W = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!R) return dvStatus('Voice isn’t available on this phone.');
  const r = new R();
  drvRecog = r;
  r.lang = 'en-GB';
  r.interimResults = false;
  let heard = '';
  dvStatus(needWake ? `Say “${S.name}…”` : 'Listening…');
  $('dvTalk').classList.toggle('live', !needWake);
  r.onresult = (e) => {
    heard = e.results[0]?.[0]?.transcript ?? '';
  };
  r.onerror = () => undefined;
  r.onend = () => {
    drvRecog = null;
    $('dvTalk').classList.remove('live');
    if (drvResume) {
      // Answer heard (or not): music back on.
      drvResume = false;
      void Native.media({ action: 'play' }).catch(() => undefined);
    }
    if (driving) void driveHeard(applyFixes(heard, S.voiceFixes), needWake);
  };
  r.start();
}
const MUSIC: Array<[RegExp, Parameters<typeof Native.media>[0]['action'], string]> = [
  [/^(next|skip)( (song|track|one))?\b/i, 'next', 'Next song'],
  [/^(previous|last|go back)( (song|track))?\b/i, 'previous', 'Previous song'],
  [/^(pause|stop)( (the )?(music|song))?$/i, 'pause', 'Paused'],
  [/^(play|resume)( (the )?(music|song))?$/i, 'play', 'Playing'],
  [/^(turn (it )?up|volume up|louder)\b/i, 'volume_up', 'Louder'],
  [/^(turn (it )?down|volume down|quieter)\b/i, 'volume_down', 'Quieter'],
];
async function driveHeard(t: string, needWake: boolean): Promise<void> {
  let cmd = t.trim();
  if (!cmd) return driveListen(true);
  if (needWake) {
    const rest = wakeMatch(cmd);
    if (rest === null) return driveListen(true);
    if (!rest) return dvSay('Yes?', () => driveListen(false));
    cmd = rest;
  }
  $('dvHeard').textContent = `“${cmd}”`;
  if (drvPending) {
    const p = drvPending;
    drvPending = null;
    if (/^(yes|yeah|yep|send( it)?|go( ahead)?|do it|ok(ay)?|sure)\b/i.test(cmd)) {
      const msg = await p.run();
      return dvSay(msg, () => driveListen(true));
    }
    if (/^(no|nope|cancel|don'?t|never ?mind)\b/i.test(cmd))
      return dvSay('Cancelled.', () => driveListen(true));
  }
  if (/^(stop|exit|end|close) driving( mode)?/i.test(cmd)) return exitDriving();
  for (const [re, action, label] of MUSIC)
    if (re.test(cmd)) {
      await Native.media({ action }).catch(() => undefined);
      dvStatus(label);
      setTimeout(() => driveListen(true), 400);
      return;
    }
  dvStatus('Thinking…');
  $('dvReply').textContent = '';
  send(cmd);
}
/** After Alton answers in Driving mode: say it, and offer to send anything it got ready. */
function driveAfterReply(reply: PhoneMessage): void {
  const text = plain(reply.text || '');
  $('dvReply').textContent = text;
  drvPending = null;
  let extra = '';
  let nav = '';
  for (const a of reply.actions ?? []) {
    if (a.done) continue;
    if (a.href?.startsWith('google.navigation:')) {
      nav = a.href;
      continue;
    }
    if (a.delEvent) {
      const de = a.delEvent;
      drvPending = {
        run: () =>
          Native.deleteEvent({ id: de.id }).then(
            () => 'Deleted.',
            (e: Error) => `Couldn’t delete it: ${e.message}`,
          ),
      };
      break;
    }
    if (a.snap) {
      const sn = a.snap;
      drvPending = {
        run: () =>
          Native.snapSend(sn).then(
            () => 'Sent on Snapchat.',
            (e: Error) => `Couldn’t send it: ${e.message}`,
          ),
      };
      break;
    }
    if (a.reply) {
      const r = a.reply;
      drvPending = {
        run: () =>
          Native.replyMessage(r).then(
            () => 'Sent.',
            (e: Error) => `Couldn’t send it: ${e.message}`,
          ),
      };
      break;
    }
    const m = a.href ? /^sms:([+\d]+)\?&?body=(.*)$/i.exec(a.href) : null;
    if (m?.[1]) {
      const to = m[1];
      const body = decodeURIComponent(m[2] ?? '');
      drvPending = {
        run: () =>
          Native.sendSms({ to, text: body }).then(
            () => 'Text sent.',
            (e: Error) => `Couldn’t send it: ${e.message}`,
          ),
      };
      break;
    }
    if (a.href && /wa\.me|whatsapp/i.test(a.href))
      extra = ' WhatsApp only sends when you tap it, so it’s ready on the screen.';
  }
  const ask = drvPending
    ? reply.actions?.some((x) => x.delEvent)
      ? ' Say “yes” to delete it, or “cancel”.'
      : ' Say “send it” to send, or “cancel”.'
    : '';
  if (nav && !drvPending) {
    // "Navigate to…" while driving: start Google Maps once it has said the route.
    dvSay(`${text} Starting navigation.`, () => {
      location.href = nav;
      setTimeout(() => driveListen(true), 3000);
    });
    return;
  }
  dvSay(`${text}${extra}${ask}`, () => driveListen(!drvPending));
}
function enterDriving(listenNow: boolean): void {
  if (!isApp) return;
  driving = true;
  $('drive').hidden = false;
  void Native.keepScreenOn({ on: true }).catch(() => undefined);
  setView('chat');
  if (!chat() || chat()?.title !== 'Driving') {
    const c = newChat(false);
    c.title = 'Driving';
  }
  $('dvHeard').textContent = '';
  $('dvReply').textContent =
    `Say “${S.name}” then what you need: “text Sam I’m on my way”, “next song”, “any messages?”`;
  drvStopAvatar();
  const cv = $<HTMLCanvasElement>('dvAvatar');
  requestAnimationFrame(() => (drvStopAvatar = mountAvatar(cv)));
  driveListen(!listenNow);
}
function exitDriving(): void {
  driving = false;
  drvPending = null;
  drvRecog?.stop();
  drvRecog = null;
  stopSpeaking();
  drvStopAvatar();
  $('drive').hidden = true;
  void Native.keepScreenOn({ on: false }).catch(() => undefined);
}
function wireDriving(): void {
  if (!isApp) return;
  $('tdDrive').hidden = false;
  $('tdDrive').onclick = () => enterDriving(false);
  $('dvExit').onclick = exitDriving;
  $('dvTalk').onclick = () => {
    drvRecog?.stop();
    setTimeout(() => driveListen(false), 300);
  };
  document.querySelectorAll<HTMLButtonElement>('#drive [data-dm]').forEach((b) => {
    b.onclick = () =>
      void Native.media({ action: b.dataset.dm as Parameters<typeof Native.media>[0]['action'] });
  });
  // New messages are read out while driving.
  void Native.addListener('message', (m) => {
    // Already read out by the phone itself when "Read new messages out loud" is on.
    if (!driving || !S.readOut || busy || S.announce !== 'off') return;
    dvSay(
      `New ${m.app} message from ${m.from}: ${m.text.slice(0, 300)}.${m.canReply ? ` Say “${S.name}, reply” to answer.` : ''}`,
      () => driveListen(true),
    );
  });
  // Opened with the assistant button or a widget button: Driving mode, or just listen.
  const opened = (mode?: string): void => {
    if (mode === 'talk') {
      if (driving) exitDriving();
      setView('chat');
      setTimeout(() => !recog && toggleMic(), 400);
    } else enterDriving(true);
  };
  void Native.addListener('assist', (d) => opened(d.mode));
  void Native.takeAssist().then((r) => {
    if (r.assist) opened(r.mode);
  });
}

/* ── Background: edge glow by time of day, and snow in December ── */
/* ── Weather you can see: rain, snow, storms and fog on the background (like the PC) ── */
interface NowWeather {
  at: number;
  code: number;
  temp: number;
  isDay: boolean;
  days: Array<{ day: string; code: number; hi: number; lo: number; rain: number }>;
}
let nowWeather: NowWeather | null = null;
async function refreshWeather(force = false): Promise<NowWeather | null> {
  if (!force && nowWeather && Date.now() - nowWeather.at < 30 * 60_000) return nowWeather;
  const f = lastFix ?? (await locate());
  if (!f) return nowWeather;
  try {
    const j = (await (
      await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${f.lat}&longitude=${f.lon}&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`,
      )
    ).json()) as {
      current?: { temperature_2m: number; weather_code: number; is_day: number };
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    };
    if (!j.current) return nowWeather;
    const d = j.daily;
    nowWeather = {
      at: Date.now(),
      code: j.current.weather_code,
      temp: j.current.temperature_2m,
      isDay: j.current.is_day === 1,
      days: (d?.time ?? []).map((day, i) => ({
        day,
        code: d?.weather_code[i] ?? 0,
        hi: d?.temperature_2m_max[i] ?? 0,
        lo: d?.temperature_2m_min[i] ?? 0,
        rain: d?.precipitation_probability_max[i] ?? 0,
      })),
    };
    applyAmbient();
    if (view === 'today') renderToday();
    void updateWidget();
  } catch {
    /* keep the last one */
  }
  return nowWeather;
}
const wxIcon = (code: number, day = true): string =>
  code === 0
    ? day
      ? '☀️'
      : '🌙'
    : code <= 2
      ? day
        ? '🌤️'
        : '☁️'
      : code === 3
        ? '☁️'
        : code === 45 || code === 48
          ? '🌫️'
          : code >= 95
            ? '⛈️'
            : precipFor(code) === 'snow'
              ? '🌨️'
              : precipFor(code) === 'rain'
                ? '🌧️'
                : '🌥️';
let stopSnow: () => void = () => undefined;
function applyAmbient(): void {
  const tint = tintFor(dayPhase(new Date().getHours()));
  const frost = S.weatherFx && nowWeather && isFrosty(nowWeather.temp);
  $('tint').style.background =
    [
      frost
        ? 'radial-gradient(ellipse at center, transparent 62%, rgba(210, 235, 255, 0.16) 100%)'
        : '',
      S.timeTint && tint.alpha > 0
        ? `radial-gradient(ellipse at center, transparent 55%, rgb(${tint.color} / ${tint.alpha}) 100%)`
        : '',
    ]
      .filter(Boolean)
      .join(', ') || 'none';
  const code = nowWeather?.code ?? 0;
  const fog = S.weatherFx && (code === 45 || code === 48);
  $('tint').classList.toggle('fog', !!fog);
  stopSnow();
  stopSnow = () => undefined;
  const c = $<HTMLCanvasElement>('snow');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const weather = S.weatherFx && nowWeather ? precipFor(code) : 'none';
  const fall = weather !== 'none' ? weather : S.snow && isFestive(new Date()) ? 'snow' : 'none';
  const storm = S.weatherFx && code >= 95;
  c.hidden = reduced || (fall === 'none' && !storm);
  if (c.hidden) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const heavy = [65, 67, 75, 82, 86, 99].includes(code)
    ? 1.6
    : [51, 53, 56, 61, 71, 80, 85].includes(code)
      ? 0.6
      : 1;
  const n = fall === 'rain' ? Math.round(70 * heavy) : fall === 'snow' ? Math.round(40 * heavy) : 0;
  const drops = Array.from({ length: n }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: fall === 'rain' ? 0.6 + Math.random() * 0.8 : 0.7 + Math.random() * 1.8,
    v: fall === 'rain' ? 0.55 + Math.random() * 0.4 : 0.02 + Math.random() * 0.04,
    w: Math.random() * Math.PI * 2,
  }));
  let raf = 0;
  let last = performance.now();
  let flash = 0;
  let nextFlash = performance.now() + 4000 + Math.random() * 8000;
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const px = window.devicePixelRatio || 1;
    if (c.width !== innerWidth * px) {
      c.width = innerWidth * px;
      c.height = innerHeight * px;
    }
    ctx.clearRect(0, 0, c.width, c.height);
    if (fall === 'rain') {
      ctx.strokeStyle = 'rgba(170, 215, 255, 0.35)';
      ctx.lineWidth = px;
      ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt;
        if (d.y > 1.02) {
          d.y = -0.03;
          d.x = Math.random();
        }
        const x = d.x * c.width;
        const y = d.y * c.height;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2 * px, y + 14 * px * d.r);
      }
      ctx.stroke();
    } else if (fall === 'snow') {
      ctx.fillStyle = 'rgba(220, 240, 255, 0.6)';
      for (const d of drops) {
        d.y += d.v * dt;
        d.w += dt;
        if (d.y > 1.02) {
          d.y = -0.02;
          d.x = Math.random();
        }
        ctx.beginPath();
        ctx.arc((d.x + Math.sin(d.w) * 0.01) * c.width, d.y * c.height, d.r * px, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (storm) {
      if (now > nextFlash) {
        flash = 1;
        nextFlash = now + 6000 + Math.random() * 9000;
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(200, 225, 255, ${0.18 * flash})`;
        ctx.fillRect(0, 0, c.width, c.height);
        flash = Math.max(0, flash - dt * 3);
      }
    }
    if (!document.hidden) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const vis = (): void => {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', vis);
  stopSnow = () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', vis);
    ctx.clearRect(0, 0, c.width, c.height);
  };
}

/* ── Look, personality and saved prompts (Settings) ── */
let stopPreview: () => void = () => undefined;
function renderLook(): void {
  const tick = (id: string, on: boolean): void => {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  };
  tick('matchLookToggle', S.matchLook);
  tick('tintToggle', S.timeTint);
  tick('snowToggle', S.snow);
  tick('wxToggle', S.weatherFx);
  const sel = $<HTMLSelectElement>('avatarPick');
  if (!sel.options.length)
    for (const a of PHONE_AVATARS) {
      const o = el('option', undefined, a.label) as HTMLOptionElement;
      o.value = a.id;
      sel.appendChild(o);
    }
  sel.value = S.avatar;
  // One-tap space looks: each tile is painted with its background.
  const lp = $('lookPresets');
  lp.textContent = '';
  for (const p of SPACE_LOOKS) {
    const t = el('button', 'bg-tile');
    t.setAttribute('aria-label', p.name);
    t.classList.toggle('on', S.theme === p.theme && S.bg === p.backdrop && S.avatar === p.avatar);
    const art = el('span', 'bg-art');
    art.dataset.bg = p.backdrop;
    const label = el('span', 'bg-label', p.name);
    label.style.color = THEME_ACCENT[p.theme];
    t.append(art, label);
    requestAnimationFrame(() => paintSpace(art, p.backdrop, 260));
    t.onclick = () => {
      S.bg = p.backdrop;
      setLook({ theme: p.theme, accent: '', avatar: p.avatar });
      applyUi();
      renderUiSettings();
      toast(`${p.name} look on.`);
    };
    lp.appendChild(t);
  }
  const sw = $('themePick');
  sw.textContent = '';
  // A mini Alton panel in each theme's colours, so it can be judged before choosing it.
  for (const id of Object.keys(THEME_ACCENT) as ThemeId[]) {
    const c = THEMES[id].colors;
    const b = el('button', 'theme-card');
    b.style.background = c['bg-void'];
    b.setAttribute('aria-label', THEME_NAMES[id]);
    b.classList.toggle('on', S.theme === id && !S.accent);
    const panel = el('span', 'tc-panel');
    panel.style.background = c['bg-panel'];
    panel.style.borderColor = c.line;
    const txt = el('span', 'tc-text', 'Aa');
    txt.style.color = c['text-primary'];
    const muted = el('span', 'tc-muted');
    muted.style.background = c['text-muted'];
    const btn = el('span', 'tc-btn');
    btn.style.background = c.accent;
    btn.style.boxShadow = `0 0 8px ${c.accent}`;
    panel.append(txt, muted, btn);
    const name = el('span', 'tc-name', THEME_NAMES[id]);
    name.style.color = c.accent;
    b.append(panel, name);
    b.onclick = () => setLook({ theme: id, accent: '' });
    sw.appendChild(b);
  }
  $<HTMLInputElement>('accentPick').value = accentNow().slice(0, 7);
  $<HTMLInputElement>('avSize').value = String(S.avatarSize);
  $<HTMLInputElement>('avGlow').value = String(S.avatarGlow);
  $<HTMLInputElement>('avMotion').value = String(S.avatarMotion);
  stopPreview();
  const pv = $<HTMLCanvasElement>('lookPreview');
  requestAnimationFrame(() => (stopPreview = mountAvatar(pv)));
}
/** A change on the phone: it now has its own look (no longer following the PC). */
function setLook(ch: Partial<State>): void {
  const wasMatching = S.matchLook;
  S = { ...S, ...ch, matchLook: false };
  save();
  applyLook();
  renderLook();
  if (wasMatching) toast('This phone now has its own look (Same look as my PC is off).');
}
function renderPersonality(): void {
  $('matchPersToggle').classList.toggle('on', S.matchPersonality);
  $('matchPersToggle').textContent = S.matchPersonality ? '✓' : '';
  const p = S.personality ?? PRESETS[0];
  if (!p) return;
  $<HTMLInputElement>('asstName').value = S.name;
  const pre = $<HTMLSelectElement>('persPreset');
  if (!pre.options.length) {
    for (const x of PRESETS) {
      const o = el('option', undefined, x.name) as HTMLOptionElement;
      o.value = x.id;
      pre.appendChild(o);
    }
    const o = el('option', undefined, 'Custom') as HTMLOptionElement;
    o.value = 'custom';
    pre.appendChild(o);
  }
  pre.value = PRESETS.some((x) => x.id === p.id) ? p.id : 'custom';
  $<HTMLSelectElement>('persTone').value = p.tone;
  $<HTMLInputElement>('persTitle').value = p.userTitle;
  $<HTMLInputElement>('persVerb').value = String(p.verbosity);
  $<HTMLInputElement>('persHumour').value = String(p.humour);
  $<HTMLInputElement>('persPro').value = String(p.proactivity);
}
function setPersonality(ch: Partial<Personality>): void {
  const base = S.personality ?? PRESETS[0];
  if (!base) return;
  S.personality = sanitizePersonality({ ...base, ...ch });
  if (S.matchPersonality) toast('This phone now has its own personality.');
  S.matchPersonality = false;
  save();
  renderPersonality();
}
function renderPrompts(): void {
  const box = $('promptList');
  box.textContent = '';
  for (const p of S.prompts) {
    const row = el('div', 'li');
    const t = el('span');
    t.style.flex = '1';
    t.appendChild(el('b', undefined, `/${p.name}`));
    t.appendChild(el('small', 'muted', ` ${p.text.slice(0, 60)}${p.text.length > 60 ? '…' : ''}`));
    const edit = el('button', 'x', '✎');
    edit.setAttribute('aria-label', `Change /${p.name}`);
    edit.onclick = () => {
      $<HTMLInputElement>('prName').value = p.name;
      $<HTMLTextAreaElement>('prText').value = p.text;
      $('prText').focus();
    };
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', `Delete /${p.name}`);
    x.onclick = () => {
      S.prompts = S.prompts.filter((y) => y !== p);
      S.promptsMine = true;
      save();
      renderPrompts();
    };
    row.append(t, edit, x);
    box.appendChild(row);
  }
}
function wireLook(): void {
  const tog = (id: string, key: 'matchLook' | 'timeTint' | 'snow' | 'weatherFx'): void => {
    $(id).onclick = () => {
      S[key] = !S[key];
      save();
      if (key === 'matchLook' && S.matchLook) {
        toast('Following your PC’s look: it updates at the next sync.');
        void syncWithPc();
      }
      applyLook();
      renderLook();
    };
  };
  tog('matchLookToggle', 'matchLook');
  tog('tintToggle', 'timeTint');
  tog('snowToggle', 'snow');
  tog('wxToggle', 'weatherFx');
  $<HTMLSelectElement>('avatarPick').onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (isPhoneAvatar(v)) setLook({ avatar: v });
  };
  $<HTMLInputElement>('accentPick').onchange = (e) =>
    setLook({ accent: (e.target as HTMLInputElement).value });
  $('accentReset').onclick = () => setLook({ accent: '' });
  for (const [id, key] of [
    ['avSize', 'avatarSize'],
    ['avGlow', 'avatarGlow'],
    ['avMotion', 'avatarMotion'],
  ] as const)
    $<HTMLInputElement>(id).onchange = (e) =>
      setLook({ [key]: Number((e.target as HTMLInputElement).value) });
  // Personality
  $('matchPersToggle').onclick = () => {
    S.matchPersonality = !S.matchPersonality;
    save();
    renderPersonality();
    if (S.matchPersonality) void syncWithPc();
  };
  $<HTMLInputElement>('asstName').onchange = (e) => {
    const v = (e.target as HTMLInputElement).value.trim().slice(0, 30);
    if (!v) return;
    S.name = v;
    S.matchPersonality = false;
    save();
    renderPersonality();
    toast(`Call me ${v}.`);
  };
  $<HTMLSelectElement>('persPreset').onchange = (e) => {
    const p = PRESETS.find((x) => x.id === (e.target as HTMLSelectElement).value);
    if (p) setPersonality({ ...p });
  };
  $<HTMLSelectElement>('persTone').onchange = (e) =>
    setPersonality({
      tone: (e.target as HTMLSelectElement).value as Personality['tone'],
      id: 'custom',
    });
  $<HTMLInputElement>('persTitle').onchange = (e) =>
    setPersonality({
      userTitle: (e.target as HTMLInputElement).value.trim().slice(0, 30),
      id: 'custom',
    });
  $<HTMLInputElement>('persVerb').onchange = (e) =>
    setPersonality({
      verbosity: Number((e.target as HTMLInputElement).value) as Personality['verbosity'],
      id: 'custom',
    });
  $<HTMLInputElement>('persHumour').onchange = (e) =>
    setPersonality({
      humour: Number((e.target as HTMLInputElement).value) as Personality['humour'],
      id: 'custom',
    });
  $<HTMLInputElement>('persPro').onchange = (e) =>
    setPersonality({
      proactivity: Number((e.target as HTMLInputElement).value) as Personality['proactivity'],
      id: 'custom',
    });
  // Saved prompts
  $('prSave').onclick = () => {
    const name = promptName($<HTMLInputElement>('prName').value);
    const text = $<HTMLTextAreaElement>('prText').value.trim();
    if (!name || !text) return toast('Give it a name and what it should ask.');
    const next = sanitizePrompts([...S.prompts.filter((p) => p.name !== name), { name, text }]);
    if (!next.some((p) => p.name === name))
      return toast(`/${name} can’t be used (it’s a built-in command). Pick another name.`);
    S.prompts = next;
    S.promptsMine = true;
    save();
    $<HTMLInputElement>('prName').value = '';
    $<HTMLTextAreaElement>('prText').value = '';
    renderPrompts();
    toast(`Saved /${name}`);
  };
}

/* ── Routes: a little map in the chat, and Google Maps buttons ── */
async function geocode(
  q: string,
  near: { lat: number; lon: number } | null,
): Promise<{ lat: number; lon: number; name: string } | null> {
  const box = near
    ? `&viewbox=${near.lon - 1},${near.lat + 1},${near.lon + 1},${near.lat - 1}`
    : '';
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1${box}&q=${encodeURIComponent(q)}`,
      { headers: { 'accept-language': 'en' } },
    );
    const j = (await r.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    const h = j[0];
    if (!h) return null;
    return {
      lat: Number(h.lat),
      lon: Number(h.lon),
      name: (h.display_name ?? q).split(',').slice(0, 2).join(','),
    };
  } catch {
    return null;
  }
}
const ROUTERS: Record<string, string> = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  bicycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
};
async function routeTool(o: Record<string, unknown>): Promise<{
  result: string;
  actions?: PhoneAction[];
  map?: RouteMap;
}> {
  const dest = String(o.destination ?? '')
    .trim()
    .slice(0, 200);
  if (!dest) return { result: 'Missing destination.' };
  const mode = ['driving', 'walking', 'transit', 'bicycling'].includes(String(o.mode))
    ? String(o.mode)
    : 'driving';
  const here = await locate();
  const originText = String(o.origin ?? '')
    .trim()
    .slice(0, 200);
  const from = originText
    ? await geocode(originText, here)
    : here
      ? { ...here, name: 'You' }
      : null;
  const to = await geocode(dest, from ?? here);
  const enc = encodeURIComponent;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1${from ? `&origin=${from.lat},${from.lon}` : ''}&destination=${enc(to ? `${to.lat},${to.lon}` : dest)}&travelmode=${mode}`;
  const navMode = mode === 'walking' ? 'w' : mode === 'bicycling' ? 'b' : 'd';
  const actions: PhoneAction[] = [];
  if (isApp && to && mode !== 'transit')
    actions.push({
      label: `Start navigation to ${dest}`,
      sub: 'Google Maps, turn by turn',
      href: `google.navigation:q=${to.lat},${to.lon}&mode=${navMode}`,
    });
  actions.push({ label: 'Open the route in Google Maps', sub: mode, href: mapsUrl });
  if (!to || !from || mode === 'transit' || !ROUTERS[mode])
    return {
      result: `${to ? '' : `Couldn't pin down "${dest}" on the map, so `}The route is ready as buttons (Google Maps).`,
      actions,
    };
  try {
    const r = await fetch(
      `${ROUTERS[mode]}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson`,
    );
    const j = (await r.json()) as {
      routes?: Array<{
        duration: number;
        distance: number;
        geometry?: { coordinates: Array<[number, number]> };
      }>;
    };
    const best = j.routes?.[0];
    if (!best) throw new Error('no route');
    const minutes = Math.max(1, Math.round(best.duration / 60));
    const km = Math.round((best.distance / 1000) * 10) / 10;
    const map: RouteMap = {
      from: from.name,
      to: to.name,
      minutes,
      km,
      mode,
      path: (best.geometry?.coordinates ?? []).slice(0, 400),
    };
    const arrive = new Date(Date.now() + minutes * 60_000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      result: `Route to ${to.name}: about ${minutes} min, ${km} km (${mode}), arriving around ${arrive} if leaving now (no live traffic). A map is shown, with buttons to start navigation or open it in Google Maps.`,
      actions,
      map,
    };
  } catch {
    return {
      result: 'Couldn’t work out the route here; the Google Maps buttons are ready.',
      actions,
    };
  }
}
/** The route drawn on a dark grid (no map tiles), like the PC's journey card. */
function routeCard(m: RouteMap): HTMLElement {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 420;
  const H = 210;
  const pad = 26;
  const fig = el('figure', 'route');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Route to ${m.to}`);
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('class', 'grid');
    svg.appendChild(l);
  };
  for (let i = 0; i <= 8; i++) line((i * W) / 8, 0, (i * W) / 8, H);
  for (let i = 0; i <= 4; i++) line(0, (i * H) / 4, W, (i * H) / 4);
  const pts = m.path.length >= 2 ? m.path : [];
  if (pts.length) {
    const lat0 = pts.reduce((n, p) => n + p[1], 0) / pts.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[0] * kx);
    const ys = pts.map((p) => -p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sc = Math.min(
      (W - pad * 2) / Math.max(1e-6, maxX - minX),
      (H - pad * 2) / Math.max(1e-6, maxY - minY),
    );
    const ox = (W - (maxX - minX) * sc) / 2;
    const oy = (H - (maxY - minY) * sc) / 2;
    const xy = pts.map((_, i) => [
      ox + ((xs[i] ?? 0) - minX) * sc,
      oy + ((ys[i] ?? 0) - minY) * sc,
    ]);
    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x?.toFixed(1)},${y?.toFixed(1)}`).join(' ');
    for (const cls of ['glow', 'path']) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', cls);
      svg.appendChild(p);
    }
    for (const [pt, cls] of [
      [xy[0], 'start'],
      [xy[xy.length - 1], 'end'],
    ] as const) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(pt?.[0] ?? 0));
      c.setAttribute('cy', String(pt?.[1] ?? 0));
      c.setAttribute('r', cls === 'end' ? '6' : '4.5');
      c.setAttribute('class', cls);
      svg.appendChild(c);
    }
  }
  fig.appendChild(svg);
  const how = m.mode === 'walking' ? 'walk' : m.mode === 'bicycling' ? 'cycle' : 'drive';
  fig.appendChild(el('figcaption', undefined, `${m.to} · ${m.minutes} min ${how} · ${m.km} km`));
  return fig;
}

/* ── Alexa: typed into the Alexa app (silent, works anywhere), or said out loud ── */
function alexaDo(command: string): void {
  if (isApp && S.alexaVia === 'app') {
    const text = `${command}${S.alexaDevice ? ` on ${S.alexaDevice}` : ''}`;
    toast('Opening the Alexa app…');
    void Native.alexaType({ text }).then(
      () => toast(`Sent to Alexa: “${text}”`),
      (e: Error) => {
        toast(`${e.message} Saying it out loud instead.`);
        tellAlexa(command);
      },
    );
    return;
  }
  tellAlexa(command);
}

/* ── Alarms: the phone's Clock app, and Alexa ── */
async function setAlarmEverywhere(
  hour: number,
  minute: number,
  label: string,
  alexa: boolean,
): Promise<string> {
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const done: string[] = [];
  if (isApp) {
    try {
      await Native.setAlarm({ hour, minute, label: label || 'Alton' });
      done.push(`set on the phone for ${time}`);
    } catch (e) {
      done.push(`couldn’t set it on the phone (${(e as Error).message})`);
    }
  } else {
    location.href = androidAlarmLink(hour, minute, label || 'Alton alarm');
    done.push('the Clock app opened with it filled in (tap Save)');
  }
  if (alexa) {
    // Give the phone a moment, then say it to the Echo.
    setTimeout(() => alexaDo(`set an alarm for ${spokenTime(time)}`), 600);
    done.push(
      isApp && S.alexaVia === 'app'
        ? 'sent to Alexa through the Alexa app'
        : 'Alexa told out loud (works when the phone is near the Echo, volume up)',
    );
  }
  toast(`⏰ ${time}: ${done.join('; ')}`);
  return `Alarm ${time}: ${done.join('; ')}. Don't promise Alexa definitely heard it.`;
}

/* ── Android app: phone powers ── */
async function appTool(
  name: string,
  input: unknown,
): Promise<{ result: string; action?: PhoneAction; activity?: string } | null> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const off = (what: string): { result: string } => ({
    result: `${what} is switched off on this phone. Tell the user to turn it on in Settings › Phone access.`,
  });
  try {
    if (name === 'read_messages') {
      const st = await powerStatus();
      if (!st?.messages) return off('Reading messages (Notification access)');
      const who = String(o.from ?? '')
        .toLowerCase()
        .trim();
      const list = (await Native.getMessages()).messages.filter(
        (m) => !who || m.from.toLowerCase().includes(who),
      );
      if (!list.length)
        return { result: who ? `No recent messages from ${o.from}.` : 'No new messages.' };
      return {
        result: list
          .slice(0, 25)
          .map(
            (m) =>
              `id=${m.id} | ${m.app} | from ${m.from} | ${new Date(m.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} | ${m.canReply ? 'can reply' : 'no reply'}: ${m.text.slice(0, 600)}`,
          )
          .join('\n'),
      };
    }
    if (name === 'reply_message') {
      const id = String(o.id ?? '');
      const text = String(o.text ?? '')
        .trim()
        .slice(0, 1000);
      if (!id || !text) return { result: 'Need the message id and the reply text.' };
      const to = String(o.to ?? '').slice(0, 60) || 'them';
      return {
        result:
          'A Send button is ready; the reply goes when the user taps it. Do not say it was sent.',
        action: { label: `Send reply to ${to}`, sub: text, reply: { id, text } },
      };
    }
    if (name === 'read_calendar') {
      const st = await powerStatus();
      if (!st?.calendar) return off('Calendar access');
      const off0 = Number(o.start_day_offset) || 0;
      const days = Math.min(31, Math.max(1, Number(o.days_ahead) || 1));
      const d0 = new Date();
      d0.setHours(0, 0, 0, 0);
      d0.setDate(d0.getDate() + off0);
      const from = d0.getTime();
      const to = from + days * 86_400_000;
      const ev = (await Native.calendarEvents({ from, to })).events;
      if (!ev.length) return { result: 'Nothing in the calendar for that time.' };
      const t = (ms: number): string =>
        new Date(ms).toLocaleString([], {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
      return {
        result: ev
          .map((e) =>
            e.allDay
              ? `${new Date(e.start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} (all day): ${e.title}`
              : `${t(e.start)} – ${new Date(e.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${e.title}${e.location ? ` @ ${e.location}` : ''} [id ${e.id}${e.repeats ? ', repeats' : ''}]`,
          )
          .join('\n'),
      };
    }
    if (name === 'edit_event' || name === 'delete_event' || name === 'add_calendar_event') {
      const st = await powerStatus();
      if (!st?.calendar) {
        if (name === 'add_calendar_event') return null; // the button version still works
        return off('Calendar access');
      }
      const t = (v: unknown): number | undefined => {
        const d = typeof v === 'string' && v ? new Date(v) : null;
        return d && !Number.isNaN(d.getTime()) ? d.getTime() : undefined;
      };
      if (name === 'add_calendar_event') {
        const start = t(o.start);
        if (!start) return { result: 'The start time must look like 2026-11-20T15:00.' };
        const end = t(o.end) ?? start + 3600_000;
        const title = String(o.title ?? 'Event').slice(0, 200);
        const { added } = await Native.addEvents({
          events: [
            {
              title,
              start,
              end,
              location: String(o.location ?? '').slice(0, 200),
              notes: String(o.details ?? '').slice(0, 1000),
              remindMinutes: 30,
            },
          ],
        });
        return {
          result: added
            ? `Added “${title}” to the phone's calendar (${new Date(start).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}), with a reminder 30 minutes before. It's done: no button needed.`
            : 'Couldn’t add it to the calendar.',
        };
      }
      const id = Number(o.id);
      if (!(id > 0)) return { result: 'Need the event id from read_calendar.' };
      if (name === 'delete_event') {
        const title = String(o.title ?? 'that event').slice(0, 100);
        return {
          result: `A Delete button is ready for “${title}”; it's only deleted when the user taps it (or says yes while driving). Don't say it's deleted.`,
          action: {
            label: `Delete “${title}” from my calendar`,
            sub: 'Tap to delete',
            delEvent: { id, title },
          },
        };
      }
      const ch: Parameters<typeof Native.updateEvent>[0] = { id };
      if (typeof o.title === 'string') ch.title = o.title.slice(0, 200);
      if (typeof o.location === 'string') ch.location = o.location.slice(0, 200);
      if (typeof o.notes === 'string') ch.notes = o.notes.slice(0, 1000);
      const s0 = t(o.start);
      const e0 = t(o.end);
      if (s0) ch.start = s0;
      if (e0) ch.end = e0;
      try {
        const { updated } = await Native.updateEvent(ch);
        return { result: updated ? 'Changed in the calendar. Done.' : 'That event wasn’t found.' };
      } catch (e) {
        return { result: (e as Error).message };
      }
    }
    if (name === 'find_contact') {
      const st = await powerStatus();
      if (!st?.contacts) {
        const r = await Native.requestAccess({ which: 'contacts' });
        if (!r.granted) return off('Contacts access');
      }
      const list = (await Native.findContacts({ name: String(o.name ?? '').slice(0, 60) }))
        .contacts;
      return {
        result: list.length
          ? list.map((c) => `${c.name}: ${c.phone}`).join('\n')
          : `No contact called ${o.name}. Ask the user for the number.`,
      };
    }
    if (name === 'snapchat_message') {
      const to = String(o.to ?? '')
        .trim()
        .slice(0, 60);
      const text = String(o.text ?? '')
        .trim()
        .slice(0, 1000);
      if (!to || !text) return { result: 'Need who it is for and the message.' };
      const lc = to.toLowerCase();
      const p =
        S.people.find((x) => x.snap && x.name.toLowerCase() === lc) ??
        S.people.find((x) => x.snap?.toLowerCase() === lc) ??
        S.people.find((x) => x.snap && x.name.toLowerCase().startsWith(lc));
      if (!p && !S.people.some((x) => x.snap))
        return {
          result:
            "Snapchat names aren't set up yet. Tell the user to open People › Snapchat friends › Read my Snapchat friends and say who each nickname is.",
        };
      const nick = p?.snap ?? to;
      return {
        result: p
          ? `Ready to send to ${p.name} (“${nick}” on Snapchat) as a Send button; nothing is sent until they confirm.`
          : `No saved person called ${to} with a Snapchat name, so it will look for a chat named exactly “${to}”. Mention that, and that they can match nicknames in People › Snapchat friends.`,
        action: {
          label: `Send on Snapchat to ${p?.name ?? to}`,
          sub: text,
          snap: { name: nick, text },
        },
      };
    }
    if (name === 'smart_home') return { result: await smartTool(input) };
    if (name === 'summarise_messages') {
      const st = await powerStatus();
      if (!st?.messages) return off('Reading messages (Notification access)');
      const hours = typeof o.hours === 'number' && o.hours > 0 ? Math.min(72, o.hours) : 12;
      const since = Date.now() - hours * 3_600_000;
      const all = (await Native.getMessages()).messages.filter((m) => m.at >= since);
      const g = groupMessages(toPhoneMsgs(all));
      return {
        result: `${g.length ? quickSummary(g) : 'No new messages.'}\n\n${digestForAi(g)}\n\n(To reply, use reply_message with the reply id.)`,
      };
    }
    if (name === 'spending') return { result: await spendingTool(o) };
    if (name === 'read_shift_trades') return { result: await readTrades() };
    if (name === 'check_shift_fit') return { result: fitReport(o.shifts, S.shifts, fitOpts()) };
    if (name === 'remind_at_work') {
      const text = String(o.text ?? '').trim();
      if (!text) return { result: 'Nothing to remind them of.' };
      if (!S.workSet)
        return {
          result:
            'Their workplace is not set yet: tell them to open Work › At work list and tap “I’m there now” while at work.',
        };
      await Native.addPlaceNote({ text });
      return {
        result: `Saved: they'll see "${text}" when they next arrive at ${S.workName || 'work'}.`,
      };
    }
    if (name === 'phone_diagnostics') {
      const r = healthReport(await Native.diagnostics());
      return {
        result: `${r.lines.join('\n')}\n\n${r.issues.length ? `Found:\n${r.issues.map((i) => `- ${i.what}. Fix: ${i.fix}`).join('\n')}` : 'Nothing obviously wrong.'}${(await powerStatus())?.usage ? '' : '\n(Usage access is off, so the keyboard’s cache size and screen time are missing: the user can allow it in Settings › Phone access.)'}`,
      };
    }
    if (name === 'set_alarm') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(o.time ?? '').trim());
      if (!m) return { result: 'Time must be HH:MM (24-hour).' };
      const alexa = typeof o.alexa === 'boolean' ? o.alexa : S.alarmAlexa;
      const r = await setAlarmEverywhere(
        Number(m[1]),
        Number(m[2]),
        String(o.label ?? '').slice(0, 60),
        alexa,
      );
      return { result: r };
    }
    if (name === 'media_control') {
      const action = String(o.action ?? '') as Parameters<typeof Native.media>[0]['action'];
      await Native.media({ action });
      return { result: 'Done.' };
    }
    if (name === 'read_shift_app') {
      const text = await readShiftApp();
      return text.ok
        ? {
            result: `Text on the shift app's screen (read just now):\n${text.text.slice(0, 12000)}\n\nWork out the shifts from this and call add_shifts. If it doesn't look like a rota (e.g. a sign-in page), tell the user.`,
          }
        : { result: text.text };
    }
  } catch (e) {
    return { result: `That didn't work: ${(e as Error).message}` };
  }
  return null;
}

let lastRead = '';
/** The reader's step log from the last read (what it saw and tapped), for "Copy log". */
async function showReadLog(): Promise<void> {
  if (!isApp) return;
  try {
    const r = await Native.readLog();
    if (!r.log) return;
    $('pwPreview').hidden = false;
    $('pwLog').textContent = r.log;
    $('pwLogAt').textContent = r.at
      ? new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
  } catch {
    /* older app */
  }
}
function showPreview(lines: number, front: string): void {
  const box = $('pwPreview');
  box.hidden = false;
  $('pwPreviewSum').textContent =
    `What Alton read last time: ${lines} line${lines === 1 ? '' : 's'}${front ? ` (from ${front})` : ''}`;
  $('pwPreviewText').textContent = lastRead.slice(0, 4000) || '(nothing)';
}
/** Open the chosen shift app, read its screen, and come back. */
async function readShiftApp(): Promise<{ ok: boolean; text: string }> {
  if (!S.shiftApp)
    return {
      ok: false,
      text: 'No shift app chosen yet: the user picks it in Work › Your shift app.',
    };
  const st = await powerStatus();
  if (!st?.screenReader)
    return {
      ok: false,
      text: 'Reading the shift app (Accessibility) is switched off. The user turns it on in Settings › Phone access.',
    };
  const app = S.shiftAppName || 'your shift app';
  toast(`Opening ${app} to read your rota…`);
  try {
    const r = await Native.readApp({
      package: S.shiftApp,
      ...(S.shiftTab ? { tap: S.shiftTab } : {}),
      ...(S.shiftNext ? { next: S.shiftNext } : {}),
      weeks: S.shiftWeeks || 2,
    });
    lastRead = r.text;
    showPreview(r.lines, r.front);
    void showReadLog();
    if (r.front && r.front !== S.shiftApp)
      return {
        ok: false,
        text: `${app} didn't stay on screen (Alton saw ${r.front}). If it asks you to sign in or unlock, do that once, then try again.`,
      };
    if (!r.text.trim())
      return {
        ok: false,
        text: `Alton opened ${app} but couldn't see any text on it. Some apps hide their text from screen readers; if so, use a screenshot instead (Share › Alton).`,
      };
    return {
      ok: true,
      text: `${r.text}${r.note ? `\n(Note: ${r.note} Tell the user.)` : ''}\n(Lines after "— next week —" are the following week: check the dates shown.)`,
    };
  } catch (e) {
    void showReadLog();
    return { ok: false, text: `Couldn't read it: ${(e as Error).message}` };
  }
}

/** add_shifts inside the app: straight into the calendar when allowed (no buttons). */
async function shiftsIntoCalendar(
  out: { result: string; actions?: PhoneAction[]; shifts?: Shift[] },
  input: unknown,
): Promise<void> {
  const keys = new Set(out.actions?.[0]?.marks ?? []);
  const fresh = (out.shifts ?? []).filter((x) => keys.has(shiftKey(x)));
  if (!fresh.length) return;
  const st = await powerStatus();
  if (!st?.calendar) {
    const r = await Native.requestAccess({ which: 'calendar' }).catch(() => ({ granted: false }));
    if (!r.granted) {
      out.result +=
        ' (Tip for the user: allow Calendar in Settings › Phone access and shifts go in by themselves.)';
      return;
    }
  }
  const mins = Number((input as { reminder_minutes?: unknown })?.reminder_minutes) || 0;
  try {
    const { added } = await Native.addEvents({
      events: fresh.map((x) => ({
        title: x.title,
        start: new Date(x.start).getTime(),
        end: new Date(x.end).getTime(),
        location: x.location ?? '',
        notes: x.notes ?? '',
        remindMinutes: mins > 0 && mins <= 1440 ? mins : 0,
      })),
    });
    if (!added) return;
    S.addedShifts = [...new Set([...S.addedShifts, ...fresh.map(shiftKey)])].slice(-500);
    out.actions = [];
    out.result = `DONE: ${added} shift${added > 1 ? 's were' : ' was'} added straight into the phone's calendar (no buttons needed; ignore anything below about buttons). ${out.result}`;
    void autoShiftAlarms();
  } catch {
    /* keep the buttons */
  }
}

/** Sets tomorrow's wake-up alarm in the Clock app by itself (or switches on the one already
 *  there at that time). Only the next day, because a Clock alarm rings at its next time. */
async function autoShiftAlarms(): Promise<void> {
  if (!isApp || !S.autoAlarms) return;
  const n = nextShift(S.shifts, new Date(), 30);
  if (!n) return;
  const a = alarmFor(n.shift, S.shiftRules, S.shiftLead);
  const start = new Date(n.shift.start);
  const at = new Date(start);
  at.setHours(a.hour, a.minute, 0, 0);
  if (at > start) at.setDate(at.getDate() - 1);
  const ms = at.getTime() - Date.now();
  const key = `${shiftKey(n.shift)}@${a.time}`;
  if (ms <= 60_000 || ms > 20 * 3600_000 || S.alarmsSet.includes(key)) return;
  try {
    await Native.setAlarm({ hour: a.hour, minute: a.minute, label: `Work · ${n.shift.title}` });
    if (S.shiftAlexa) setTimeout(() => alexaDo(`set an alarm for ${spokenTime(a.time)}`), 800);
    S.alarmsSet = [...S.alarmsSet, key].slice(-60);
    save();
    toast(`⏰ Alarm set for ${a.time} (${n.shift.title}, ${n.when})`);
  } catch {
    /* no clock app took it: the shift card's buttons still work */
  }
}

/* Settings › Phone access */
/** Tell the phone side what to read while charging (app, tab, next-week button, weeks). */
async function pushAutoRota(): Promise<void> {
  if (!isApp) return;
  await Native.setAutoRota({
    on: S.autoRota && !!S.shiftApp,
    package: S.shiftApp,
    tap: S.shiftTab,
    next: S.shiftNext,
    weeks: S.shiftWeeks || 2,
  }).catch(() => undefined);
}

/** The phone read the shift app by itself: add the shifts (answered on the phone). */
let autoRotaBusy = false;
async function takeAutoRota(): Promise<void> {
  if (!isApp || autoRotaBusy || busy || !apiKey) return;
  autoRotaBusy = true;
  try {
    const r = await Native.takeAutoRota();
    if (r.last) S.autoRotaLast = r.last;
    void showReadLog();
    if (!r.text.trim()) return;
    setView('chat');
    newChat(false);
    phoneOnlyNext = true;
    send(
      `My shift app was read automatically while my phone was charging. Here is what it shows. Add my shifts and tell me in one or two lines if anything changed (new, moved or removed shifts):\n\n${r.text.slice(0, 12000)}`,
    );
  } catch {
    /* not available */
  } finally {
    autoRotaBusy = false;
  }
}

async function renderWork(): Promise<void> {
  const name = $<HTMLInputElement>('wkName');
  if (document.activeElement !== name) name.value = S.workName;
  const lists = $<HTMLInputElement>('wkLists');
  if (document.activeElement !== lists) lists.value = S.workLists.join(', ');
  $('wkEnd').classList.toggle('on', S.workEnd);
  $('wkEnd').textContent = S.workEnd ? '✓' : '';
  $<HTMLSelectElement>('wkLead').value = String(S.workEndLead);
  $('wkLead').hidden = !S.workEnd;
  $<HTMLSelectElement>('wkRadius').value = String(S.workRadius);
  showWorkMap();
  const ps = await Native.placeStatus().catch(() => null);
  if (ps) atWork = { here: ps.here, since: ps.since };
  const bg = $<HTMLButtonElement>('wkBg');
  bg.textContent = ps?.background ? 'On ✓' : 'Allow';
  bg.classList.toggle('acc', !ps?.background);
  $('wkMsg').textContent = !S.workSet
    ? 'Not set yet: at work, tap “I’m there now”.'
    : `${ps?.here ? '📍 You’re at' : 'Watching for'} ${S.workName || 'work'}.${ps?.notes.length ? ` ${ps.notes.length} reminder${ps.notes.length > 1 ? 's' : ''} waiting: ${ps.notes.join('; ')}` : ''}`;
}

async function renderPowers(): Promise<void> {
  document.querySelectorAll<HTMLElement>('.app-grp').forEach((g) => (g.hidden = !isApp));
  $('workAppCard').hidden = !isApp;
  $('workAtCard').hidden = !isApp;
  $('phoneHead').hidden = !isApp;
  if (!isApp) return;
  void renderWork();
  $('pwAutoRota').classList.toggle('on', S.autoRota);
  $('pwAutoRota').textContent = S.autoRota ? '✓' : '';
  $('pwAutoRotaNote').textContent = !S.shiftApp
    ? 'Choose your shift app above first.'
    : S.autoRotaLast
      ? `Last read by itself: ${new Date(S.autoRotaLast).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'Not run yet: plug your phone in and leave it on the home screen.';
  const st = await powerStatus();
  const set = (id: string, on: boolean, offLabel: string): void => {
    const b = $<HTMLButtonElement>(id);
    b.textContent = on ? 'On ✓' : offLabel;
    b.classList.toggle('acc', !on);
  };
  set('pwMsgs', !!st?.messages, 'Turn on');
  set('pwCal', !!st?.calendar, 'Allow');
  set('pwContacts', !!st?.contacts, 'Allow');
  set('pwScreen', !!st?.screenReader, 'Turn on');
  set('pwUsage', !!st?.usage, 'Allow');
  set('pwBt', !!st?.bluetooth, 'Allow');
  $('pwAlarms').classList.toggle('on', S.autoAlarms);
  $('pwAlarms').textContent = S.autoAlarms ? '✓' : '';
  $('pwAutoMsg').classList.toggle('on', S.autoMessages);
  $('pwAutoMsg').textContent = S.autoMessages ? '✓' : '';
  $('pwApp').textContent = S.shiftAppName || 'Choose…';
  const tab = $<HTMLInputElement>('pwTab');
  if (document.activeElement !== tab) tab.value = S.shiftTab;
  const trade = $<HTMLInputElement>('pwTrade');
  if (document.activeElement !== trade)
    trade.value = S.tradeTab === 'Shift Trade' ? '' : S.tradeTab;
  const nx = $<HTMLInputElement>('pwNext');
  if (document.activeElement !== nx) nx.value = S.shiftNext;
  $<HTMLSelectElement>('pwWeeks').value = String(S.shiftWeeks || 2);
  renderWatch();
  $<HTMLSelectElement>('pwAnnounce').value = S.announce;
  $<HTMLInputElement>('pwQuietFrom').value = String(S.quietFrom);
  $<HTMLInputElement>('pwQuietTo').value = String(S.quietTo);
  $<HTMLSelectElement>('pwAlexaVia').value = S.alexaVia;
  const dev = $<HTMLInputElement>('pwAlexaDev');
  if (document.activeElement !== dev) dev.value = S.alexaDevice;
  for (const [id, on] of [
    ['pwAlexa', S.alarmAlexa],
    ['pwShiftAlexa', S.shiftAlexa],
  ] as const) {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  }
  $('pwReadOut').classList.toggle('on', S.readOut);
  $('pwReadOut').textContent = S.readOut ? '✓' : '';
}
function wirePowers(): void {
  if (!isApp) return;
  $('pwMsgs').onclick = () => void Native.openSettings({ which: 'messages' });
  $('pwScreen').onclick = () => void Native.openSettings({ which: 'screenReader' });
  $('pwRestricted').onclick = () => void Native.openSettings({ which: 'app' });
  $('pwUsage').onclick = () => void Native.openSettings({ which: 'usage' });
  $('pwBt').onclick = async () => {
    await Native.requestAccess({ which: 'bluetooth' }).catch(() => undefined);
    void renderPowers();
    void updateWidget();
  };
  $('pwAssist').onclick = () => {
    toast('Choose “Digital assistant app”, then pick Alton.');
    void Native.openSettings({ which: 'assistant' });
  };
  $<HTMLSelectElement>('pwAnnounce').onchange = async (e) => {
    S.announce = (e.target as HTMLSelectElement).value as State['announce'];
    save();
    sendAnnounce();
    if (S.announce !== 'off' && !(await powerStatus())?.messages)
      toast('Also turn on “Read & reply to messages” above, so Alton can see them.');
  };
  for (const id of ['pwQuietFrom', 'pwQuietTo'] as const)
    $<HTMLInputElement>(id).onchange = (e) => {
      const n = Math.min(
        23,
        Math.max(0, Math.round(Number((e.target as HTMLInputElement).value) || 0)),
      );
      if (id === 'pwQuietFrom') S.quietFrom = n;
      else S.quietTo = n;
      save();
      sendAnnounce();
    };
  sendAnnounce();
  $<HTMLSelectElement>('pwAlexaVia').onchange = (e) => {
    S.alexaVia = (e.target as HTMLSelectElement).value as State['alexaVia'];
    save();
  };
  $<HTMLInputElement>('pwAlexaDev').onchange = (e) => {
    S.alexaDevice = (e.target as HTMLInputElement).value.trim().slice(0, 40);
    save();
  };
  $('pwAlexaTest').onclick = () => alexaDo('what time is it');
  $('pwAlexa').onclick = () => {
    S.alarmAlexa = !S.alarmAlexa;
    save();
    void renderPowers();
  };
  $('pwShiftAlexa').onclick = () => {
    S.shiftAlexa = !S.shiftAlexa;
    save();
    void renderPowers();
  };
  $('pwReadOut').onclick = () => {
    S.readOut = !S.readOut;
    save();
    void renderPowers();
  };
  $('pwCal').onclick = async () => {
    await Native.requestAccess({ which: 'calendar' }).catch(() => undefined);
    void renderPowers();
  };
  $('pwContacts').onclick = async () => {
    await Native.requestAccess({ which: 'contacts' }).catch(() => undefined);
    void renderPowers();
  };
  $('pwAutoMsg').onclick = () => {
    S.autoMessages = !S.autoMessages;
    save();
    void renderPowers();
  };
  $('pwAlarms').onclick = () => {
    S.autoAlarms = !S.autoAlarms;
    save();
    void renderPowers();
    if (S.autoAlarms) void autoShiftAlarms();
  };
  $('pwApp').onclick = async () => {
    const box = $('pwAppList');
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.textContent = 'Loading your apps…';
    box.hidden = false;
    try {
      const { apps } = await Native.listApps();
      box.textContent = '';
      for (const a of apps) {
        const b = el('button', 'li', a.name);
        b.style.width = '100%';
        b.style.textAlign = 'left';
        b.onclick = () => {
          S.shiftApp = a.package;
          S.shiftAppName = a.name;
          save();
          void pushAutoRota();
          box.hidden = true;
          void renderPowers();
          toast(`Shift app: ${a.name}`);
        };
        box.appendChild(b);
      }
    } catch {
      box.textContent = 'Couldn’t list your apps.';
    }
  };
  $<HTMLInputElement>('pwTab').onchange = (e) => {
    S.shiftTab = (e.target as HTMLInputElement).value.trim().slice(0, 40);
    save();
    void pushAutoRota();
  };
  $<HTMLInputElement>('pwTrade').onchange = (e) => {
    S.tradeTab = (e.target as HTMLInputElement).value.trim().slice(0, 40) || 'Shift Trade';
    save();
  };
  $<HTMLInputElement>('pwNext').onchange = (e) => {
    S.shiftNext = (e.target as HTMLInputElement).value.trim().slice(0, 40);
    save();
    void pushAutoRota();
  };
  $<HTMLSelectElement>('pwWeeks').onchange = (e) => {
    S.shiftWeeks = Number((e.target as HTMLSelectElement).value) || 2;
    save();
    void pushAutoRota();
  };
  $('pwAutoRota').onclick = () => {
    S.autoRota = !S.autoRota;
    save();
    void pushAutoRota();
    void renderPowers();
  };
  // Pick up a rota read while charging, whenever Alton comes to the front.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => void takeAutoRota(), 800);
  });
  void pushAutoRota();
  setTimeout(() => void takeAutoRota(), 1500);
  $('pwRead').onclick = async () => {
    const r = await readShiftApp();
    if (!r.ok) {
      $('pwPreview').setAttribute('open', '');
      return toast(r.text);
    }
    setView('chat');
    newChat(false);
    send(
      `Here is what my shift app shows right now. Add my shifts to my calendar and tell me if anything changed:\n\n${r.text.slice(0, 12000)}`,
    );
  };
  // Back from Android's settings: show what changed.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && view === 'set') void renderPowers();
    if (!document.hidden) checkAtWorkNow();
    if (!document.hidden && S.workSet)
      void Native.placeStatus()
        .then((ps) => (atWork = { here: ps.here, since: ps.since }))
        .catch(() => undefined);
  });
  // At work: name, "I'm there now", always-on location, lists, test, forget.
  $<HTMLInputElement>('wkName').onchange = (e) => {
    S.workName = (e.target as HTMLInputElement).value.trim().slice(0, 40);
    save();
    if (S.workSet) void Native.setPlace({ name: S.workName || 'work' });
  };
  $<HTMLInputElement>('wkLists').onchange = (e) => {
    const v = (e.target as HTMLInputElement).value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5);
    S.workLists = v.length ? v : ['Shopping'];
    lastWorkItems = '';
    save();
    void renderWork();
  };
  $<HTMLSelectElement>('wkLead').onchange = (e) => {
    const v = Number((e.target as HTMLSelectElement).value);
    S.workEndLead = v === 15 || v === 30 ? v : 0;
    save();
    void scheduleWatch();
  };
  $('wkEnd').onclick = () => {
    S.workEnd = !S.workEnd;
    save();
    void scheduleWatch();
    void renderWork();
  };
  $('pwLogCopy').onclick = async () => {
    const text = `Alton ${__APP_VERSION__} shift app read\n${S.shiftAppName || S.shiftApp} · tab ${S.shiftTab || '(auto)'} · next ${S.shiftNext || '(auto)'}\n\n${$('pwLog').textContent ?? ''}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Log copied: paste it into your message.');
    } catch {
      void shareText('Alton read log', text);
    }
  };
  $('wkHere').onclick = () => {
    $('wkMsg').textContent = 'Finding where you are…';
    if (!navigator.geolocation) return void ($('wkMsg').textContent = 'Location isn’t available.');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const radius = Math.max(S.workRadius, Math.min(300, Math.round(p.coords.accuracy * 2)));
        workMap?.show(p.coords.latitude, p.coords.longitude, true);
        void saveWorkplace(p.coords.latitude, p.coords.longitude, radius);
      },
      () => ($('wkMsg').textContent = 'Couldn’t get your location: allow Location for Alton.'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };
  $<HTMLSelectElement>('wkRadius').onchange = (e) => {
    S.workRadius = Number((e.target as HTMLSelectElement).value) || 150;
    save();
    workMap?.setRadius(S.workRadius);
  };
  $('wkSave').onclick = () => {
    const p = workMap?.pin();
    if (!p) return void ($('wkMapMsg').textContent = 'Tap the map where you work first.');
    void saveWorkplace(p.lat, p.lon, S.workRadius);
  };
  const find = async (): Promise<void> => {
    const q = $<HTMLInputElement>('wkSearch').value.trim();
    if (!q) return;
    $('wkMapMsg').textContent = 'Searching…';
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } },
      );
      const j = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      const hit = j[0];
      if (!hit) return void ($('wkMapMsg').textContent = `Couldn’t find “${q}”. Try the town too.`);
      workMap?.show(Number(hit.lat), Number(hit.lon), true);
      $('wkMapMsg').textContent =
        `${hit.display_name.split(',').slice(0, 3).join(',')}: move the pin if needed, then save.`;
    } catch {
      $('wkMapMsg').textContent = 'Couldn’t search (no signal?).';
    }
  };
  $('wkFind').onclick = () => void find();
  $<HTMLInputElement>('wkSearch').onkeydown = (e) => {
    if (e.key === 'Enter') void find();
  };
  $('wkBg').onclick = () => {
    toast('Permissions › Location › “Allow all the time”');
    void Native.openSettings({ which: 'app' });
  };
  $('wkTest').onclick = async () => {
    if (!S.workSet) return toast('Set your workplace first (“I’m there now”).');
    lastWorkItems = '';
    await Native.setPlace({
      items: workItems(S.lists, S.workLists),
      listLabel: S.workLists.join(' & ') || 'Shopping',
    });
    await Native.testPlace();
    toast(
      workItems(S.lists, S.workLists).length
        ? 'Check your notifications.'
        : `Your ${S.workLists.join(' & ')} list is empty, so there’s nothing to show yet.`,
    );
  };
  $('wkClear').onclick = async () => {
    await Native.clearPlace().catch(() => undefined);
    S.workSet = false;
    S.workLat = 0;
    S.workLon = 0;
    save();
    void scheduleWatch();
    void renderWork();
  };
  // Proximity alerts don't survive an app update: set it up again on start.
  if (S.workSet) {
    lastWorkItems = '';
    queueWorkSync();
    checkAtWorkNow();
  }
  void autoShiftAlarms();
  setInterval(() => void autoShiftAlarms(), 30 * 60_000);
}

/* ── App lock (PIN) ── */
async function pinHashOf(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
let hiddenAt = 0;
function lockNow(): void {
  if (!S.pinHash) return;
  $('lock').hidden = false;
  $<HTMLInputElement>('pinInput').value = '';
  setTimeout(() => $('pinInput').focus(), 50);
}
async function tryUnlock(): Promise<void> {
  const v = $<HTMLInputElement>('pinInput').value.trim();
  if ((await pinHashOf(v, S.pinSalt)) === S.pinHash) {
    $('lock').hidden = true;
    $('pinMsg').textContent = '';
  } else {
    $('pinMsg').textContent = 'Wrong PIN.';
    $<HTMLInputElement>('pinInput').value = '';
  }
}
async function setPin(): Promise<void> {
  if (S.pinHash) {
    if (!confirm('Remove the PIN lock?')) return;
    S.pinHash = '';
    S.pinSalt = '';
    save();
    renderSettings();
    return toast('PIN lock removed.');
  }
  const a = prompt('Choose a PIN (4–8 digits)')?.trim() ?? '';
  if (!/^\d{4,8}$/.test(a)) return toast('Use 4 to 8 digits.');
  if (prompt('Type it again')?.trim() !== a) return toast('Those didn’t match.');
  S.pinSalt = crypto.getRandomValues(new Uint32Array(2)).join('-');
  S.pinHash = await pinHashOf(a, S.pinSalt);
  save();
  renderSettings();
  toast('PIN lock on: asked when you open Alton or come back after 5 minutes.');
}

/* ── Look: the PC's accent colour and an animated avatar (header and welcome screen) ── */
const phoneState = (): string =>
  busy ? 'thinking' : recog ? 'listening' : isSpeaking() ? 'speaking' : 'idle';
const accentNow = (): string => S.accent || THEME_ACCENT[S.theme] || '#3fd0ff';
function mountAvatar(canvas: HTMLCanvasElement, style: PhoneAvatar = S.avatar): () => void {
  const ch = hexToChannels(accentNow());
  canvas.style.setProperty('--accent', ch);
  canvas.style.setProperty('--amber', '255 181 71');
  canvas.style.setProperty('--alert', '255 77 94');
  canvas.style.setProperty('--ice', '220 244 255');
  const glow = AVATAR_STEPS.glow[S.avatarGlow - 1] ?? 1;
  canvas.style.filter =
    glow === 1 ? '' : `brightness(${0.7 + glow * 0.3}) saturate(${0.8 + glow * 0.2})`;
  setAvatarMotion(AVATAR_STEPS.motion[S.avatarMotion - 1] ?? 1);
  if (style === 'none') return () => undefined;
  const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const level = (): number => (isSpeaking() ? 0.35 : 0);
  const center = (): { x: number; y: number } => ({
    x: canvas.clientWidth / 2,
    y: canvas.clientHeight / 2,
  });
  const radius = (): number =>
    Math.max(4, Math.min(canvas.clientWidth, canvas.clientHeight) / 2 - 2);
  if (style === 'wave' || style === 'swarm' || style === 'orb' || style === 'head')
    return runAvatar(canvas, style, { state: phoneState, level, center, radius, reduced });
  // The PC's own avatars, drawn by the same code as on the PC.
  const size = { w: canvas.clientWidth || 40, h: canvas.clientHeight || 40 };
  const st = (): AssistantState => phoneState() as AssistantState;
  const live = {
    get current(): LiveAvatar {
      return {
        state: st(),
        reducedMotion: reduced(),
        getLevel: level,
        center: center(),
        radius: radius(),
        lastReply: () => {
          const m = chat()
            ?.messages.filter((x) => x.role === 'assistant')
            .pop();
          return m ? { text: m.text, at: m.at } : null;
        },
      };
    },
  };
  if (style === 'code') return runCodeRing(canvas, size, live);
  if (style === 'sphere' || style === 'cloud') return runSphere(canvas, size, live, style);
  if (style === 'face') return runFace(canvas, size, live);
  return runRings(canvas, size, {
    center: center(),
    radius: radius(),
    ringText: `${S.name.toUpperCase()} · ONLINE · `,
    reducedMotion: reduced(),
    getLevel: level,
    stateRef: {
      get current(): AssistantState {
        return st();
      },
    },
    sinceRef: { current: performance.now() },
    draw: { current: null },
  });
}
let stopHeader: () => void = () => undefined;
let stopWelcome: () => void = () => undefined;
function applyLook(): void {
  document.documentElement.style.setProperty('--accent', accentNow());
  const k = AVATAR_STEPS.size[S.avatarSize - 1] ?? 1;
  document.documentElement.style.setProperty('--av-size', `${Math.round(190 * k)}px`);
  applyAmbient();
  applyUi();
  stopHeader();
  const c = $<HTMLCanvasElement>('hdrAvatar');
  c.hidden = S.avatar === 'none';
  stopHeader = mountAvatar(c);
}

/* ── Live camera: point it at something and ask straight away ── */
let camStream: MediaStream | null = null;
const CAM_ASKS = [
  'What is this?',
  'Read this to me',
  'Add these shifts to my calendar',
  'What does this error mean?',
  'Summarise this',
  'How much is this worth?',
];
async function openCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) return toast('This browser can’t use the camera.');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false,
    });
  } catch {
    return toast('Allow the camera for this site in your browser settings.');
  }
  const v = $<HTMLVideoElement>('camVideo');
  v.srcObject = camStream;
  $('cam').hidden = false;
  const chips = $('camChips');
  chips.textContent = '';
  for (const q of CAM_ASKS) {
    const b = el('button', undefined, q);
    b.onclick = () => void shootAndAsk(q);
    chips.appendChild(b);
  }
}
function closeCamera(): void {
  for (const t of camStream?.getTracks() ?? []) t.stop();
  camStream = null;
  $('cam').hidden = true;
}
async function shootAndAsk(question: string): Promise<void> {
  const v = $<HTMLVideoElement>('camVideo');
  if (!v.videoWidth) return toast('The camera isn’t ready yet.');
  const scale = (max: number): HTMLCanvasElement => {
    const k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    return c;
  };
  const big = scale(1568).toDataURL('image/jpeg', 0.85);
  const small = scale(160).toDataURL('image/jpeg', 0.7);
  closeCamera();
  pending.push({ data: big.slice(big.indexOf(',') + 1), thumb: small });
  renderThumbs();
  send(question.trim() || 'What is this?');
}

/* ── Voice settings and training ── */
function renderVoiceSettings(): void {
  const sel = $<HTMLSelectElement>('voicePick');
  const voices = voiceList().filter((v) => /^en/i.test(v.lang));
  sel.textContent = '';
  const auto = el('option', undefined, 'Best British voice (automatic)') as HTMLOptionElement;
  auto.value = '';
  sel.appendChild(auto);
  for (const v of voices) {
    const o = el('option', undefined, `${v.name} (${v.lang})`) as HTMLOptionElement;
    o.value = v.name;
    sel.appendChild(o);
  }
  sel.value = S.voiceName;
  $<HTMLInputElement>('voiceRate').value = String(S.voiceRate || 1);
  const box = $('voiceTrain');
  box.textContent = '';
  for (const p of TRAIN_PHRASES) {
    const row = el('div', 'li');
    const b = el('button', 'btn', '🎤');
    b.setAttribute('aria-label', `Say “${p}”`);
    const t = el('span', undefined, p);
    t.style.flex = '1';
    const r = el('div', 'muted');
    r.style.fontSize = '12px';
    b.onclick = () => trainOnce(p, r);
    const wrap = el('div');
    wrap.style.flex = '1';
    wrap.append(t, r);
    row.append(b, wrap);
    box.appendChild(row);
  }
  const learnt = $('voiceLearnt');
  learnt.textContent = S.voiceFixes.length
    ? S.voiceFixes.map((f) => `“${f.heard}” → ${f.meant}`).join(' · ')
    : 'Nothing learnt yet.';
}
const TRAIN_PHRASES = [
  'Open Lunar Client',
  'Text Mum that I will be late',
  'Remind me to call the bank at five',
  'Add bread to my shopping list',
  'What time do I finish work tomorrow?',
  'Set a timer for ten minutes',
];
function trainOnce(phrase: string, out: HTMLElement): void {
  const W = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!R) return toast('Voice isn’t supported in this browser.');
  const r = new R();
  r.lang = 'en-GB';
  r.interimResults = false;
  out.textContent = 'Listening… say it now';
  r.onresult = (e) => {
    const heard = e.results[0]?.[0]?.transcript ?? '';
    const fix = learnFix(heard, phrase);
    if (fix) {
      S.voiceFixes = addFix(S.voiceFixes, fix);
      save();
      out.textContent = `Heard “${heard}”. Learnt: “${fix.heard}” → ${fix.meant}`;
      $('voiceLearnt').textContent = S.voiceFixes
        .map((f) => `“${f.heard}” → ${f.meant}`)
        .join(' · ');
    } else out.textContent = heard ? `Heard “${heard}”: ✓` : 'Didn’t catch that, try again.';
  };
  r.onerror = () => (out.textContent = 'Couldn’t listen (allow the microphone).');
  r.start();
}

/* ── Reminders: listed here, and pinged by the app if it's open at the time ── */
const pinged = new Set<number>();
function scheduleReminderPings(): void {
  // In the Android app they also become real notifications that work with the app closed.
  void scheduleWatch();
  for (const r of S.reminders) {
    const ms = r.at - Date.now();
    if (ms <= 0 || ms > 6 * 3600_000 || pinged.has(r.at)) continue;
    pinged.add(r.at);
    setTimeout(() => {
      toast(`⏰ ${r.what}`);
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      if ('Notification' in window && Notification.permission === 'granted')
        void navigator.serviceWorker?.ready
          .then((reg) =>
            reg.showNotification(`Alton · ${r.what}`, { body: 'Reminder', tag: `r${r.at}` }),
          )
          .catch(() => new Notification(`Alton · ${r.what}`));
    }, ms);
  }
}
function renderReminders(): void {
  S.reminders = S.reminders.filter((r) => r.at > Date.now() - 3600_000);
  const box = $('reminderList');
  box.textContent = '';
  for (const r of S.reminders) {
    const row = el('div', 'li');
    const t = el(
      'span',
      undefined,
      `${new Date(r.at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${r.what}`,
    );
    t.style.flex = '1';
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', 'Remove from this list');
    x.onclick = () => {
      S.reminders = S.reminders.filter((y) => y !== r);
      save();
      renderReminders();
    };
    row.append(t, x);
    box.appendChild(row);
  }
  if (!S.reminders.length)
    box.appendChild(
      el(
        'p',
        'muted',
        'None yet. Say “remind me to … at …”. They go into your phone’s Calendar so they buzz.',
      ),
    );
}

/* ── Offline queue ── */
const queuedImages = new Map<string, string[]>();
let flushing = false;
async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine || !apiKey) return;
  flushing = true;
  try {
    while (S.queue.length) {
      if (busy) await new Promise((r) => setTimeout(r, 500));
      if (busy) continue;
      const id = S.queue.shift() ?? '';
      save();
      const c = S.chats.find((x) => x.id === id);
      if (!c || c.messages[c.messages.length - 1]?.role !== 'user') continue;
      if (chatId === id) renderMsgs('Thinking…');
      await ask(c, queuedImages.get(id) ?? []);
      queuedImages.delete(id);
    }
  } finally {
    flushing = false;
  }
}

/* ── Saved prompts: typing "/" shows them above the box ── */
function hideSlash(): void {
  const box = $('slash');
  box.textContent = '';
  box.hidden = true;
}
function renderSlash(): void {
  const v = $<HTMLTextAreaElement>('msg').value;
  const m = v.match(/^\/([a-z0-9-]*)$/i);
  if (!m) return hideSlash();
  const q = (m[1] ?? '').toLowerCase();
  const hits = S.prompts.filter((p) => p.name.startsWith(q)).slice(0, 8);
  const box = $('slash');
  box.textContent = '';
  box.hidden = !hits.length;
  for (const p of hits) {
    const b = el('button');
    b.appendChild(el('b', undefined, `/${p.name}`));
    b.appendChild(
      el('span', 'muted', ` ${(p.text.split('\n')[0] ?? '').replace('{text}', '…').slice(0, 60)}`),
    );
    b.onclick = () => {
      const ta = $<HTMLTextAreaElement>('msg');
      ta.value = `/${p.name} `;
      hideSlash();
      ta.focus();
    };
    box.appendChild(b);
  }
}

/* ── Share a chat (to WhatsApp, notes, email...) ── */
function shareChat(): void {
  const c = chat();
  if (!c?.messages.length) return toast('Nothing to share yet.');
  const text = [
    `# ${cleanTitle(c.title)}`,
    ...c.messages.map((m) => `${m.role === 'user' ? 'Me' : S.name}: ${plain(m.text)}`),
  ].join('\n\n');
  void shareText(cleanTitle(c.title), text).then((ok) => {
    if (!ok)
      void navigator.clipboard
        ?.writeText(text)
        .then(() => toast('Chat copied.'))
        .catch(() => toast('Couldn’t copy that.'));
  });
}

/** Hand a calendar file to the phone: the share sheet (pick Calendar), else a download
 *  that opens in the calendar app. */
async function openIcs(name: string, text: string): Promise<void> {
  if (isApp) {
    if (!(await shareFile(name, text, 'Add shifts to your calendar')))
      toast('Couldn’t open the calendar file.');
    return;
  }
  const file = new File([text], name, { type: 'text/calendar' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Shifts' });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  toast('Saved shifts.ics: open it to add the shifts to your calendar.');
}

function actionNode(a: PhoneAction): HTMLElement {
  if (a.done) {
    // Already sent by itself: show it, don't offer to send again.
    const d = el('div', 'actbtn done');
    const t = el('span');
    t.appendChild(document.createTextNode(a.label));
    t.appendChild(el('small', undefined, `${a.done}${a.sub ? ` ${a.sub}` : ''}`));
    d.append(el('span', 'dot'), t);
    return d;
  }
  const b = el(a.href ? 'a' : 'button', 'actbtn') as HTMLAnchorElement;
  const txt = el('span');
  txt.appendChild(document.createTextNode(a.label));
  if (a.sub) txt.appendChild(el('small', undefined, a.sub));
  b.appendChild(el('span', 'dot'));
  b.appendChild(txt);
  if (a.href) {
    b.href = a.href;
    if (/^https?:/.test(a.href)) {
      b.target = '_blank';
      b.rel = 'noopener noreferrer';
    }
  } else if (a.share != null) {
    b.onclick = () => {
      const text = a.share ?? '';
      void shareText('Share', text).then((ok) => {
        if (!ok) void navigator.clipboard?.writeText(text).then(() => toast('Copied'));
      });
    };
  } else if (a.copy != null) {
    const text = a.copy;
    b.onclick = () => {
      void navigator.clipboard?.writeText(text).then(
        () => {
          b.classList.add('done');
          toast('Copied');
        },
        () => toast('Couldn’t copy that.'),
      );
    };
  } else if (a.pickFor) {
    b.onclick = () => void pickContact(a.pickFor);
  } else if (a.delEvent) {
    const de = a.delEvent;
    b.onclick = async () => {
      if (b.classList.contains('done')) return;
      try {
        await Native.deleteEvent({ id: de.id });
        b.classList.add('done');
        const sub = b.querySelector('small');
        if (sub) sub.textContent = 'Deleted ✓';
        toast(`Deleted “${de.title}”.`);
      } catch (e) {
        toast((e as Error).message);
      }
    };
  } else if (a.snap) {
    const sn = a.snap;
    b.onclick = async () => {
      if (b.classList.contains('done')) return;
      toast('Opening Snapchat to send it…');
      try {
        await Native.snapSend(sn);
        b.classList.add('done');
        const sub = b.querySelector('small');
        if (sub) sub.textContent = `Sent ✓ ${sn.text}`;
        toast('Sent on Snapchat.');
      } catch (e) {
        toast((e as Error).message);
      }
    };
  } else if (a.reply) {
    const r = a.reply;
    b.onclick = async () => {
      if (b.classList.contains('done')) return;
      try {
        await Native.replyMessage(r);
        b.classList.add('done');
        const sub = b.querySelector('small');
        if (sub) sub.textContent = `Sent ✓ ${r.text}`;
        toast('Reply sent.');
      } catch (e) {
        toast((e as Error).message);
      }
    };
  } else if (a.alexa) {
    const cmd = a.alexa;
    b.onclick = () => tellAlexa(cmd);
  } else if (a.ics) {
    const { name, text } = a.ics;
    b.onclick = () => void openIcs(name, text);
  }
  if (a.marks?.length) {
    b.addEventListener('click', () => {
      S.addedShifts = [...new Set([...S.addedShifts, ...(a.marks ?? [])])].slice(-500);
      save();
    });
  }
  return b;
}

function assistantNode(m: PhoneMessage, liveActivity?: string): HTMLElement {
  const d = el('div', 'it');
  const who = el('div', 'who');
  who.appendChild(el('span', 'dot'));
  who.appendChild(document.createTextNode(S.name));
  d.appendChild(who);
  const body = el('div', 'md');
  body.innerHTML = md(m.text);
  d.appendChild(body);
  if (m.map) d.appendChild(routeCard(m.map));
  if (m.actions?.length) {
    const box = el('div', 'actions');
    m.actions.forEach((a) => box.appendChild(actionNode(a)));
    d.appendChild(box);
  }
  if (m.sources?.length) {
    const src = el('div', 'sources');
    m.sources.slice(0, 8).forEach((s) => {
      const a = el('a', undefined, s.title);
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      src.appendChild(a);
    });
    d.appendChild(src);
  }
  if (liveActivity) {
    const act = el('div', 'activity');
    act.appendChild(el('span', 'pulse'));
    act.appendChild(document.createTextNode(liveActivity));
    d.appendChild(act);
  } else if (m.text) {
    const tools = el('div', 'tools');
    const copy = el('button', undefined, 'Copy');
    copy.onclick = () =>
      void navigator.clipboard?.writeText(plain(m.text)).then(() => toast('Copied'));
    const read = el('button', undefined, 'Read aloud');
    read.onclick = () => say(m.text, true);
    tools.append(copy, read);
    const c = chat();
    if (c && c.messages[c.messages.length - 1] === m) {
      const again = el('button', undefined, 'Try again');
      again.onclick = () => regenerate();
      tools.appendChild(again);
    }
    d.appendChild(tools);
  }
  return d;
}

function renderMsgs(activity?: string): void {
  stopWelcome();
  stopWelcome = () => undefined;
  renderShiftCard();
  renderBackupNudge();
  const box = $('msgs');
  box.textContent = '';
  const c = chat();
  $('title').textContent = c ? cleanTitle(c.title) : S.name;
  $('researchBtn').classList.toggle('on', research);
  if (!c || !c.messages.length) {
    const w = el('div', 'welcome');
    if (S.avatar !== 'none') {
      const av = el('canvas', 'welcome-avatar') as HTMLCanvasElement;
      w.appendChild(av);
      requestAnimationFrame(() => (stopWelcome = mountAvatar(av)));
    }
    w.appendChild(
      el(
        'h2',
        undefined,
        research
          ? 'What would you like to research?'
          : `Hi${S.userName ? ` ${S.userName}` : ''}, how can I help?`,
      ),
    );
    w.appendChild(el('p', 'muted', 'Works anywhere, even with your PC off.'));
    const g = el('div', 'sugg');
    [
      'Brief me',
      'Text Mum that I’ll be late',
      'Add my shifts to my calendar',
      'Directions to the nearest Tesco',
      'Set a 20 minute timer',
      'What’s the weather this weekend?',
      'Add milk to my shopping list',
      'Explain this photo',
    ]
      .slice(0, 6)
      .forEach((t) => {
        const b = el('button', undefined, t);
        b.onclick = () => {
          if (t === 'Add my shifts to my calendar') return askForShifts();
          return t === 'Explain this photo' ? $('photo').click() : send(t);
        };
        g.appendChild(b);
      });
    w.appendChild(g);
    if (S.prompts.length) {
      const pr = el('div', 'sugg');
      S.prompts.slice(0, 4).forEach((p) => {
        const b = el('button', undefined, `/${p.name}`);
        b.title = p.text;
        b.onclick = () => {
          const ta = $<HTMLTextAreaElement>('msg');
          ta.value = `/${p.name} `;
          ta.focus();
        };
        pr.appendChild(b);
      });
      w.appendChild(el('p', 'muted', 'Your saved prompts (type / to see them all):'));
      w.appendChild(pr);
    }
    box.appendChild(w);
    return;
  }
  c.messages.forEach((m, i) => {
    if (m.role === 'user') {
      const u = el('div', 'me');
      (m.images ?? []).forEach((src) => {
        if (/^data:image\//.test(src)) {
          const im = el('img');
          im.src = src;
          u.appendChild(im);
        }
      });
      u.appendChild(document.createTextNode(m.text));
      box.appendChild(u);
      if (i === c.messages.length - 1 && S.queue.includes(c.id)) {
        const w = el('p', 'muted', 'Waiting for signal… sends automatically.');
        w.style.alignSelf = 'flex-end';
        w.style.margin = '-6px 4px 0';
        w.style.fontSize = '12px';
        box.appendChild(w);
      }
      if (m.at) box.appendChild(el('div', 'msg-time mine', msgTime(m.at)));
      const isLastUser = !c.messages.slice(i + 1).some((x) => x.role === 'user');
      if (isLastUser && !busy) {
        const edit = el('button', 'chip', 'Edit');
        edit.style.alignSelf = 'flex-end';
        edit.style.marginTop = '-8px';
        edit.onclick = () => editLast();
        box.appendChild(edit);
      }
    } else {
      box.appendChild(
        assistantNode(m, i === c.messages.length - 1 && busy ? activity || undefined : undefined),
      );
      if (m.at) box.appendChild(el('div', 'msg-time', msgTime(m.at)));
    }
  });
  $('main').scrollTop = 1e9;
}

function setSending(on: boolean): void {
  const b = $('sendBtn');
  b.classList.toggle('stop', on);
  b.innerHTML = on
    ? '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
}

function say(text: string, force = false, then?: () => void): void {
  if ((!S.speak && !force) || !canSpeak()) return then?.();
  stopSpeaking();
  speak(plain(text).slice(0, 3000), {
    rate: S.voiceRate || 1,
    voice: S.voiceName,
    ...(then ? { onend: then } : {}),
  });
}

/* Hands-free: Alton answers out loud, then listens again, until you tap the button or say
   "stop" / "that's all". */
let handsFree = false;
function setHandsFree(on: boolean): void {
  handsFree = on;
  $('handsBtn').classList.toggle('live', on);
  if (on) {
    toast('Hands-free on: just talk. Say “that’s all” to stop.');
    if (!recog && !busy) toggleMic();
  } else {
    recog?.stop();
    stopSpeaking();
  }
}

/* ── Chats drawer ── */
function renderChatList(q = ''): void {
  const box = $('chatlist');
  box.textContent = '';
  const l = q.toLowerCase();
  [...S.chats]
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
    .filter(
      (c) =>
        !l ||
        c.title.toLowerCase().includes(l) ||
        c.messages.some((m) => m.text.toLowerCase().includes(l)),
    )
    .forEach((c) => {
      const row = el('div', `ci${c.id === chatId ? ' on' : ''}`);
      const t = el(
        'span',
        undefined,
        `${c.research ? '🔬 ' : ''}${c.id.startsWith('p-') ? '' : '🖥 '}${cleanTitle(c.title)}`,
      );
      t.onclick = () => {
        chatId = c.id;
        research = c.research;
        closeDrawer();
        renderMsgs();
      };
      const pin = el('button', 'x', c.pinned ? '★' : '☆');
      pin.setAttribute('aria-label', c.pinned ? 'Unpin' : 'Pin');
      pin.onclick = () => {
        c.pinned = !c.pinned;
        save();
        renderChatList(q);
      };
      const ren = el('button', 'x', '✎');
      ren.setAttribute('aria-label', 'Rename');
      ren.onclick = () => {
        const v = prompt('Rename chat', cleanTitle(c.title))?.trim();
        if (!v) return;
        c.title = v.slice(0, 80);
        c.updatedAt = Date.now();
        save();
        renderChatList(q);
        renderMsgs();
      };
      const x = el('button', 'x', '✕');
      x.onclick = () => {
        if (!confirm(`Delete “${cleanTitle(c.title)}” from this phone?`)) return;
        S.chats = S.chats.filter((y) => y !== c);
        if (chatId === c.id) chatId = S.chats[0]?.id ?? null;
        save();
        renderChatList(q);
        renderMsgs();
      };
      row.append(t, pin, ren, x);
      box.appendChild(row);
    });
  if (!box.childNodes.length) box.appendChild(el('p', 'muted', 'No chats yet.'));
}
const openDrawer = (): void => {
  $('drawer').classList.add('open');
  $('scrim').classList.add('open');
  renderChatList();
};
const closeDrawer = (): void => {
  $('drawer').classList.remove('open');
  $('scrim').classList.remove('open');
};

/* ── Photos ── */
function shrink(file: File, max: number, q: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That isn’t a picture.'));
    };
    img.src = url;
  });
}
function renderThumbs(): void {
  const box = $('thumbs');
  box.textContent = '';
  pending.forEach((p, n) => {
    const d = el('div');
    const im = el('img');
    im.src = p.thumb;
    const x = el('button', undefined, '×');
    x.onclick = () => {
      pending.splice(n, 1);
      renderThumbs();
    };
    d.append(im, x);
    box.appendChild(d);
  });
}

/* ── Voice input ── */
type Recog = {
  lang: string;
  interimResults: boolean;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  }) => void;
  onend: () => void;
  onerror: (e: { error: string }) => void;
  start(): void;
  stop(): void;
};
let recog: Recog | null = null;
/** Hold the mic button to talk; let go to send. A short tap starts/stops as before. */
let holdSend = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
function micDown(): void {
  holdTimer = setTimeout(() => {
    holdTimer = null;
    holdSend = true;
    if (!recog) toggleMic();
    if ('vibrate' in navigator) navigator.vibrate(15);
  }, 280);
}
function micUp(): void {
  if (holdTimer) {
    // A tap.
    clearTimeout(holdTimer);
    holdTimer = null;
    toggleMic();
    return;
  }
  if (holdSend) recog?.stop();
}

function toggleMic(): void {
  const W = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!R) return toast('Voice typing isn’t supported in this browser; use the keyboard’s mic.');
  if (recog) {
    recog.stop();
    return;
  }
  const r = new R();
  recog = r;
  // UK English unless the phone is set to another English (better with UK accents).
  r.lang =
    /^en-(gb|ie)$/i.test(navigator.language) || !/^en/i.test(navigator.language)
      ? 'en-GB'
      : navigator.language;
  r.interimResults = true;
  const ta = $<HTMLTextAreaElement>('msg');
  const before = ta.value;
  let final = '';
  r.onresult = (e) => {
    let text = '';
    let done = false;
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res) continue;
      text += res[0]?.transcript ?? '';
      if (res.isFinal) done = true;
    }
    ta.value = `${before}${before ? ' ' : ''}${applyFixes(text, S.voiceFixes)}`;
    if (done) final = ta.value;
  };
  r.onend = () => {
    recog = null;
    $('micBtn').classList.remove('live');
    if (
      final &&
      handsFree &&
      /^(stop|that'?s all|that is all|goodbye|bye|thanks,? that'?s all)\.?$/i.test(final.trim())
    ) {
      $<HTMLTextAreaElement>('msg').value = '';
      setHandsFree(false);
      return;
    }
    const hold = holdSend;
    holdSend = false;
    if (final && (S.autoSend || handsFree || hold)) send(final);
    else if (handsFree && !final)
      setTimeout(() => handsFree && !busy && !recog && toggleMic(), 400);
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed')
      toast('Allow the microphone for this site in your browser settings.');
  };
  $('micBtn').classList.add('live');
  r.start();
}

/* ── Android app: search your contacts and tap one to save it ── */
let allContacts: Array<{ name: string; phone: string }> = [];
async function openContactSheet(forName?: string): Promise<void> {
  try {
    const st = await powerStatus();
    if (!st?.contacts) {
      const r = await Native.requestAccess({ which: 'contacts' });
      if (!r.granted)
        return toast(
          'Allow Contacts for Alton (Settings › Phone access) to add from your contacts.',
        );
    }
    allContacts = (await Native.findContacts({ name: '' })).contacts.filter((c) => c.phone);
  } catch (e) {
    return toast(`Couldn’t open your contacts: ${(e as Error).message}`);
  }
  if (!allContacts.length) return toast('No contacts with phone numbers found on this phone.');
  const sheet = $('contactSheet');
  const input = $<HTMLInputElement>('csSearch');
  const list = $('csList');
  const draw = (): void => {
    const q = input.value.trim().toLowerCase();
    list.textContent = '';
    const seen = new Set<string>();
    for (const c of allContacts) {
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.replace(/\s/g, '').includes(q))
        continue;
      const key = `${c.name}|${c.phone.replace(/\D/g, '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = el('button', 'li');
      b.appendChild(el('b', undefined, c.name));
      b.appendChild(el('small', 'muted', ` ${c.phone}`));
      b.onclick = () => {
        const name = forName ?? c.name;
        S.people = [
          ...S.people.filter((x) => x.name.toLowerCase() !== name.toLowerCase()),
          { name, phone: c.phone },
        ];
        save();
        sheet.hidden = true;
        renderPeople();
        toast(
          forName ? `Saved ${forName} (${c.name}). Ask again and it’ll work.` : `Saved ${c.name}.`,
        );
      };
      list.appendChild(b);
      if (list.childElementCount >= 200) break;
    }
    if (!list.childElementCount) list.appendChild(el('p', 'muted', 'No match.'));
  };
  input.value = forName ?? '';
  input.oninput = draw;
  $('csClose').onclick = () => (sheet.hidden = true);
  sheet.hidden = false;
  draw();
  setTimeout(() => input.focus(), 50);
}

/* ── People, lists, memories ── */
async function pickContact(forName?: string): Promise<void> {
  if (isApp) return openContactSheet(forName);
  const nav = navigator as unknown as {
    contacts?: {
      select(
        props: string[],
        o: { multiple: boolean },
      ): Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
    };
  };
  if (!nav.contacts)
    return toast(
      'This browser can’t open contacts (Android Chrome can). Type the name and number in People instead.',
    );
  try {
    const picked = await nav.contacts.select(['name', 'tel', 'email'], { multiple: !forName });
    for (const c of picked) {
      const name = forName ?? c.name?.[0] ?? 'Contact';
      const p: Person = {
        name,
        ...(c.tel?.[0] ? { phone: c.tel[0] } : {}),
        ...(c.email?.[0] ? { email: c.email[0] } : {}),
      };
      S.people = [...S.people.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), p];
    }
    save();
    renderPeople();
    if (picked.length)
      toast(
        forName
          ? `Saved ${forName}. Ask again and it’ll work.`
          : `Saved ${picked.length} contact(s).`,
      );
  } catch {
    /* cancelled */
  }
}
function renderShifts(): void {
  renderShiftNext();
  renderPayCard();
  renderMoney();
  renderCalendar();
  $('shGetApp').hidden = !isApp;
  $('shGetCal').hidden = !isApp;
  $('shToCal').hidden = !isApp;
  $<HTMLInputElement>('shWords').value = S.shiftWords;
  // Week timeline and hours (and pay) per week.
  const colors = {
    bar: 'var(--accent)',
    text: '#dff3ff',
    muted: 'var(--muted)',
    grid: 'var(--line)',
    today: 'rgba(120,200,255,.08)',
  };
  $('shiftWeek').innerHTML = S.shifts.length
    ? weekSvg(S.shifts, mondayOf(new Date()), colors) +
      hoursSvg(
        weeksSummary(S.shifts, new Date(), S.payRate, S.unpaidBreak, S.breakAll ? 0 : 6),
        colors,
        money,
      )
    : '';
  const box = $('shiftList');
  box.textContent = '';
  const up = upcomingShifts(S.shifts);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const pay = (d: Date): string =>
    S.payRate > 0
      ? ` (≈ ${money(weekPay(S.shifts, S.payRate, S.unpaidBreak, d, S.breakAll ? 0 : 6))})`
      : '';
  $('shiftHours').textContent = up.length
    ? `This week ${weekHours(S.shifts, now)}h${pay(now)} · next week ${weekHours(S.shifts, next)}h${pay(next)}`
    : 'No shifts yet: share a screenshot of your rota to Alton.';
  up.slice(0, 20).forEach((s) => {
    const row = el('div', 'li');
    const a = alarmFor(s, S.shiftRules, S.shiftLead);
    const t = el('span', undefined, `${describeShift(s)} · ${s.title}`);
    t.style.flex = '1';
    t.title = `Alarm ${a.time}`;
    const kind = el('i', `k-${shiftKind(s)}`);
    kind.style.cssText = 'width:4px;height:22px;border-radius:3px;margin-right:8px;flex:none';
    row.appendChild(kind);
    t.onclick = () => editShift(s);
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', 'Remove this shift');
    x.onclick = () => {
      S.shifts = S.shifts.filter((y) => y !== s);
      save();
      renderShifts();
    };
    row.append(t, x);
    box.appendChild(row);
  });
  $<HTMLInputElement>('shiftLead').value = String(S.shiftLead);
  $<HTMLInputElement>('shiftRules').value = formatAlarmRules(S.shiftRules);
  $<HTMLInputElement>('payRate').value = S.payRate ? String(S.payRate) : '';
  $<HTMLInputElement>('unpaidBreak').value = S.unpaidBreak ? String(S.unpaidBreak) : '';
  $<HTMLSelectElement>('breakAll').value = S.breakAll ? '1' : '0';
  $<HTMLInputElement>('travel').value = S.travel ? String(S.travel) : '';
  $<HTMLInputElement>('payNext').value = S.payNext;
  $<HTMLSelectElement>('payCycle').value = String(S.payCycle);
  $<HTMLInputElement>('payLag').value = S.payLag ? String(S.payLag) : '';
  $('payToCal').hidden = !isApp || !S.payNext;
}

/* ── Shifts tab: next shift, month calendar, getting shifts in ── */
let calMonth = (() => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
})();
let calSel = ymd(new Date());
let editing: Shift | null = null;
/** The next message is answered on the phone, not the PC (e.g. reading the shift app). */
let phoneOnlyNext = false;
/** Chats that use this phone's own powers (answered here, not on the PC). */
const phoneChats = new Set<string>();

/** The next payday and what it should pay, from the saved shifts. */
function payInfo(): {
  day: string;
  label: string;
  when: string;
  hours: number;
  gross: number;
  net: number;
  period: { start: string; end: string };
  shifts: number;
} | null {
  if (!S.payNext) return null;
  const day = nextPayday(S.payNext, S.payCycle);
  const period = day ? payPeriod(day, S.payCycle, S.payLag) : null;
  if (!day || !period) return null;
  const p = periodPay(S.shifts, period, S.payRate, S.unpaidBreak, S.breakAll ? 0 : 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${day}T00:00`).getTime() - today.getTime()) / 86_400_000);
  return {
    day,
    label: new Date(`${day}T12:00`).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    when: days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`,
    hours: p.hours,
    gross: p.gross,
    net: netPay(p.gross),
    period,
    shifts: p.shifts,
  };
}
/** Take-home from gross: the share real payslips show, else a rough UK tax and NI guess. */
function netPay(gross: number): number {
  const r = takeHomeRate(S.payslips ?? []);
  return r ? Math.round(gross * r * 100) / 100 : ukTakeHome(gross, S.payCycle);
}

function renderPayCard(): void {
  const box = $('payCard');
  box.textContent = '';
  const pd = payInfo();
  if (!pd) {
    box.append(
      el('div', 'lbl', 'Payday'),
      el(
        'div',
        'muted',
        'Set your next payday and pay rate in “Alarms, pay & travel” below, and Alton works out each pay.',
      ),
    );
    return;
  }
  const dm = (x: string): string =>
    new Date(`${x}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const lastDay = new Date(`${pd.period.end}T12:00`);
  lastDay.setDate(lastDay.getDate() - 1);
  box.append(el('div', 'lbl', `💷 Payday ${pd.when}`), el('div', 'when', pd.label));
  if (S.payRate > 0) {
    box.append(
      el('div', 'big', `≈ ${money(pd.net)}`),
      el(
        'div',
        'muted',
        `after tax & NI (${takeHomeRate(S.payslips ?? []) ? 'from your payslips' : 'rough'}) · ${money(pd.gross)} before tax`,
      ),
    );
  } else box.append(el('div', 'muted', 'Add your pay per hour below to see how much.'));
  const meta = el('div', 'meta');
  for (const c of [
    `${pd.hours}h`,
    `${pd.shifts} shift${pd.shifts === 1 ? '' : 's'}`,
    `Shifts ${dm(pd.period.start)} – ${dm(ymd(lastDay))}`,
  ])
    meta.appendChild(el('span', undefined, c));
  box.appendChild(meta);
}

function renderShiftNext(): void {
  const box = $('shiftNext');
  const cur = currentShift(S.shifts);
  const n = cur ?? upcomingShifts(S.shifts)[0];
  box.textContent = '';
  if (!n) return;
  const start = new Date(n.start);
  const mins = Math.round((start.getTime() - Date.now()) / 60_000);
  const until = cur
    ? `On shift now · ${timeLeft(cur)} left`
    : mins < 60
      ? `Starts in ${Math.max(0, mins)} min`
      : mins < 48 * 60
        ? `Starts in ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
        : `In ${Math.round(mins / 1440)} days`;
  const day = start.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const a = alarmFor(n, S.shiftRules, S.shiftLead);
  const chips = [
    `${SHIFT_KIND_LABEL[shiftKind(n)]} shift`,
    `${n.start.slice(11, 16)}–${n.end.slice(11, 16)}`,
    cur ? '' : `⏰ Alarm ${a.time}`,
    S.travel && !cur ? `🚗 Leave by ${leaveBy(n, S.travel)}` : '',
    S.travel ? `🏠 Home by ${homeBy(n, S.travel)}` : '',
    n.location ? `📍 ${n.location}` : '',
  ].filter(Boolean);
  box.append(
    el('div', 'lbl', cur ? 'At work' : 'Next shift'),
    el('div', 'when', cur ? n.title : day),
    el('div', 'muted', cur ? until : `${n.title} · ${until}`),
  );
  const meta = el('div', 'meta');
  for (const c of chips) meta.appendChild(el('span', undefined, c));
  box.appendChild(meta);
}

function renderCalendar(): void {
  const { y, m } = calMonth;
  $('calTitle').textContent = new Date(y, m, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
  const grid = $('calGrid');
  grid.textContent = '';
  for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) grid.appendChild(el('div', 'dow', d));
  const today = ymd(new Date());
  const pays = new Set(
    S.payNext ? paydays(S.payNext, S.payCycle, new Date(y, m - 1, 20), new Date(y, m + 1, 12)) : [],
  );
  for (const week of monthGrid(y, m, S.shifts))
    for (const d of week) {
      const b = el('button');
      b.className = [
        d.inMonth ? '' : 'out',
        d.date === today ? 'today' : '',
        d.date === calSel ? 'sel' : '',
        pays.has(d.date) ? 'payday' : '',
      ]
        .filter(Boolean)
        .join(' ');
      b.appendChild(el('span', undefined, String(d.day)));
      const first = d.shifts[0];
      if (pays.has(d.date)) b.appendChild(el('span', 'pay', '💷'));
      if (first) {
        b.appendChild(el('i', `k-${shiftKind(first)}`));
        b.appendChild(el('small', undefined, first.start.slice(11, 16)));
      }
      b.setAttribute(
        'aria-label',
        `${d.date}${d.shifts.length ? `: ${d.shifts.map((s) => s.title).join(', ')}` : ''}`,
      );
      b.onclick = () => {
        calSel = d.date;
        renderCalendar();
      };
      grid.appendChild(b);
    }
  const sel = S.shifts.filter((s) => s.start.startsWith(calSel));
  const label = new Date(`${calSel}T12:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  $('calDay').textContent = sel.length
    ? `${label}: ${sel.map((s) => `${s.title} ${s.start.slice(11, 16)}–${s.end.slice(11, 16)}`).join(', ')}`
    : `${label}: day off`;
  if (pays.has(calSel)) $('calDay').textContent += ' · 💷 Payday';
  const hrs = monthHours(S.shifts, y, m);
  const pre = `${y}-${String(m + 1).padStart(2, '0')}-`;
  const stats: Array<[string, string]> = [
    [`${hrs}h`, 'this month'],
    [String(S.shifts.filter((s) => s.start.startsWith(pre)).length), 'shifts'],
    S.payRate > 0
      ? [money(hrs * S.payRate), 'pay (before tax)']
      : [String(daysOff(S.shifts, 14)), 'days off (2 wks)'],
  ];
  const st = $('shiftStats');
  st.textContent = '';
  for (const [b, small] of stats) {
    const d = el('div');
    d.append(el('b', undefined, b), el('small', 'muted', small));
    st.appendChild(d);
  }
}

function editShift(s: Shift | null): void {
  editing = s;
  $('shForm').hidden = false;
  $('shCalRow').hidden = true;
  $<HTMLInputElement>('shDate').value = s ? s.start.slice(0, 10) : calSel;
  $<HTMLInputElement>('shFrom').value = s ? s.start.slice(11, 16) : '';
  $<HTMLInputElement>('shTo').value = s ? s.end.slice(11, 16) : '';
  $<HTMLInputElement>('shTitle').value = s ? s.title : S.shiftAppName || '';
  $('shSave').textContent = s ? 'Update' : 'Save';
  $('shForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function addShifts(fresh: Shift[], replace?: Shift, alert = false): void {
  if (alert) alertRotaChanges(S.shifts, fresh);
  const kept = replace ? S.shifts.filter((x) => x !== replace) : S.shifts;
  S.shifts = mergeShifts(kept, fresh);
  save();
  renderShifts();
  renderShiftCard();
  void autoShiftAlarms();
}

async function shiftsFromMyCalendar(): Promise<void> {
  const msg = $('shGetMsg');
  const st = await powerStatus();
  if (!st?.calendar) {
    const r = await Native.requestAccess({ which: 'calendar' }).catch(() => ({ granted: false }));
    if (!r.granted) {
      msg.textContent = 'Alton needs Calendar access: allow it in Settings › Phone access.';
      return;
    }
  }
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  try {
    const { events } = await Native.calendarEvents({
      from: from.getTime(),
      to: from.getTime() + 56 * 86_400_000,
    });
    const found = shiftsFromCalendar(events, S.shiftWords);
    const pick = $('shPick');
    pick.textContent = '';
    if (!found.length) {
      // Show what is in the calendar so the right name can be tapped.
      const names = [...new Set(events.filter((e) => !e.allDay).map((e) => e.title.trim()))]
        .filter(Boolean)
        .slice(0, 16);
      msg.textContent = names.length
        ? `Nothing called “${S.shiftWords}” in the next 8 weeks. Which of these are your shifts? Tap one:`
        : 'Your calendar has no timed events in the next 8 weeks.';
      for (const n of names) {
        const b = el('button', 'chip', n);
        b.onclick = () => {
          S.shiftWords = n;
          save();
          $<HTMLInputElement>('shWords').value = n;
          void shiftsFromMyCalendar();
        };
        pick.appendChild(b);
      }
      return;
    }
    const before = new Set(S.shifts.map(shiftKey));
    const added = found.filter((x) => !before.has(shiftKey(x))).length;
    // Already in the calendar, so "Add all to my calendar" skips them.
    S.addedShifts = [...new Set([...S.addedShifts, ...found.map(shiftKey)])].slice(-500);
    addShifts(found, undefined, true);
    msg.textContent = `Found ${found.length} shift${found.length > 1 ? 's' : ''} (${added} new).`;
  } catch (e) {
    msg.textContent = `Couldn't read the calendar: ${(e as Error).message}`;
  }
}

/* ── Sleep planner (Work › Sleep, Today, bedtime notifications) ── */
const sleepOpts = (): SleepOptions => ({
  hours: S.sleepHours,
  windDown: S.windDown,
  alarmRules: S.shiftRules,
  alarmLead: S.shiftLead,
  travel: S.travel,
});
function sleepText(): string {
  const p = nextSleep(S.shifts, sleepOpts());
  return p ? sleepLine(p) : '';
}
function renderSleep(): void {
  const line = sleepText();
  $('slLine').textContent =
    line ||
    (S.shifts.length
      ? 'No shift in the next day and a half: sleep as you like.'
      : 'Add your shifts and Alton plans your bedtimes around them.');
  const gaps = $('slGaps');
  gaps.textContent = '';
  for (const g of shortGaps(S.shifts).slice(0, 3))
    gaps.appendChild(
      el(
        'p',
        'muted',
        `⚠️ Only ${g.hours} h between ${describeShift(g.after)} and ${describeShift(g.before)}.`,
      ),
    );
  $('slOn').classList.toggle('on', S.sleepOn);
  $('slOn').textContent = S.sleepOn ? '✓' : '';
  $<HTMLSelectElement>('slHours').value = String(S.sleepHours);
  $<HTMLSelectElement>('slWind').value = String(S.windDown);
}
function wireSleep(): void {
  $('slOn').onclick = () => {
    S.sleepOn = !S.sleepOn;
    save();
    renderSleep();
    void scheduleWatch();
  };
  $<HTMLSelectElement>('slHours').onchange = (e) => {
    S.sleepHours = Number((e.target as HTMLSelectElement).value) || 8;
    save();
    renderSleep();
    void scheduleWatch();
  };
  $<HTMLSelectElement>('slWind').onchange = (e) => {
    S.windDown = Number((e.target as HTMLSelectElement).value) || 0;
    save();
    renderSleep();
    void scheduleWatch();
  };
}

/* ── Spending from bank notifications (Settings › Phone › Spending, Today, the spending tool) ── */
/** From the last payday (or 30 days ago without one) to now. */
function spendPeriod(days?: number): { from: number; label: string } {
  const now = new Date();
  if (days && days > 0)
    return { from: now.getTime() - days * 86_400_000, label: `the last ${days} days` };
  const last = S.payNext
    ? paydays(S.payNext, S.payCycle, new Date(now.getTime() - 45 * 86_400_000), now).pop()
    : undefined;
  if (last) {
    const d = new Date(`${last}T00:00`);
    return {
      from: d.getTime(),
      label: `payday (${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })})`,
    };
  }
  return { from: now.getTime() - 30 * 86_400_000, label: 'the last 30 days' };
}
async function payments(): Promise<Payment[]> {
  if (!isApp || !S.spendApps.length) return [];
  try {
    return paymentsFrom((await Native.getSpendLog()).items);
  } catch {
    return [];
  }
}
async function renderTodaySpend(): Promise<void> {
  const card = $('tdSpendCard');
  if (!isApp || !S.spendApps.length) {
    card.hidden = true;
    return;
  }
  const p = spendPeriod();
  const s = spendSummary(await payments(), p.from);
  const box = $('tdSpend');
  box.textContent = '';
  box.appendChild(el('p', undefined, `${gbp(s.spent - s.refunds)} spent since ${p.label}`));
  const pd = payInfo();
  if (pd && pd.net > 0)
    box.appendChild(
      el(
        'p',
        'muted',
        `Next pay about ${money(pd.net)} ${pd.when} · ${gbp(s.perDay)} a day so far`,
      ),
    );
  if (s.top.length)
    box.appendChild(
      el(
        'p',
        'muted',
        s.top
          .slice(0, 3)
          .map((t) => `${t.merchant} ${gbp(t.total)}`)
          .join(' · '),
      ),
    );
  card.hidden = false;
}
async function renderSpendSettings(): Promise<void> {
  $('spendGrp').hidden = !isApp;
  if (!isApp) return;
  $('spApps').textContent = S.spendNames.length
    ? `Watching: ${S.spendNames.join(', ')}`
    : 'No bank apps chosen yet.';
  const n = (await payments()).length;
  const access = (await powerStatus())?.messages;
  $('spState').textContent = S.spendApps.length
    ? `${n} payment${n === 1 ? '' : 's'} saved on this phone.${access ? '' : ' Notification access is off, so new ones are missed.'}`
    : '';
}
function wireSpend(): void {
  if (!isApp) return;
  $('spPick').onclick = async () => {
    const box = $('spPicker');
    if (!box.hidden) {
      box.hidden = true;
      return;
    }
    box.textContent = 'Loading your apps…';
    box.hidden = false;
    try {
      const { apps } = await Native.listApps();
      box.textContent = '';
      for (const a of apps) {
        const row = el('div', 'li');
        const name = el('span', undefined, a.name);
        name.style.flex = '1';
        row.appendChild(name);
        const c = el('button', 'check');
        const on = (): boolean => S.spendApps.includes(a.package);
        const paint = (): void => {
          c.classList.toggle('on', on());
          c.textContent = on() ? '✓' : '';
        };
        paint();
        c.onclick = () => {
          const i = S.spendApps.indexOf(a.package);
          if (i >= 0) {
            S.spendApps.splice(i, 1);
            S.spendNames.splice(i, 1);
          } else {
            S.spendApps.push(a.package);
            S.spendNames.push(a.name);
          }
          save();
          paint();
          void Native.setSpendApps({ packages: S.spendApps });
          void renderSpendSettings();
          void renderTodaySpend();
        };
        row.appendChild(c);
        box.appendChild(row);
      }
    } catch {
      box.textContent = 'Couldn’t list your apps.';
    }
  };
  $('spClear').onclick = async () => {
    if (!confirm('Forget every payment Alton saved from your bank notifications?')) return;
    await Native.clearSpendLog();
    void renderSpendSettings();
    void renderTodaySpend();
    toast('Saved payments removed.');
  };
}
async function spendingTool(o: Record<string, unknown>): Promise<string> {
  if (!S.spendApps.length)
    return 'Spending isn’t set up: the user picks their bank apps in Settings › Phone › Spending (it reads their payment notifications, on the phone only).';
  const days = typeof o.days === 'number' ? Math.min(366, Math.max(1, Math.round(o.days))) : 0;
  const p = spendPeriod(days);
  let list = await payments();
  const who = typeof o.merchant === 'string' ? o.merchant.trim().toLowerCase() : '';
  if (who) list = list.filter((x) => x.merchant.toLowerCase().includes(who));
  const s = spendSummary(list, p.from);
  const recent = list
    .filter((x) => x.at >= p.from)
    .slice(-15)
    .map(
      (x) =>
        `${new Date(x.at).toLocaleString([], { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${x.kind === 'spend' ? '' : `(${x.kind}) `}${gbp(x.amount)} ${x.merchant || x.app}`,
    );
  const pd = payInfo();
  return [
    `Since ${p.label}${who ? ` at “${String(o.merchant)}”` : ''}: spent ${gbp(s.spent)} in ${s.count} payments${s.refunds ? `, refunds ${gbp(s.refunds)}` : ''}${s.income ? `, money in ${gbp(s.income)}` : ''}. About ${gbp(s.perDay)} a day.`,
    s.top.length
      ? `Top: ${s.top.map((t) => `${t.merchant} ${gbp(t.total)} (${t.count})`).join(', ')}`
      : '',
    pd
      ? `Next payday ${pd.label} (${pd.when})${pd.net > 0 ? `, about ${money(pd.net)} after tax` : ''}.`
      : '',
    recent.length ? `Recent:\n${recent.join('\n')}` : 'No payments seen in that time.',
    '(From bank notifications on this phone; payments without a notification are missing.)',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ── Smart home: SmartThings with a token kept on this phone only ── */
let stToken = ls.get('alton-st') ?? '';
const stFetch: StFetch = async (method, path, body) => {
  const r = await CapacitorHttp.request({
    url: `${ST_API}${path}`,
    method,
    headers: {
      Authorization: `Bearer ${stToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { data: body } : {}),
    connectTimeout: 15_000,
    readTimeout: 15_000,
  });
  let json: unknown = r.data;
  if (typeof json === 'string')
    try {
      json = JSON.parse(json);
    } catch {
      /* not JSON */
    }
  return { status: r.status, json };
};
async function smartTool(raw: unknown): Promise<string> {
  const i = cleanSmartInput(raw);
  if (!i) return 'Unknown smart-home action.';
  if (!stToken)
    return 'SmartThings isn’t connected on this phone: the user adds a token in Settings › Phone › Smart home.';
  try {
    return await smartHome(stFetch, i, async (q) => confirm(q));
  } catch {
    return 'Couldn’t reach SmartThings. Check the internet.';
  }
}
function renderSmart(): void {
  $('smartGrp').hidden = !isApp;
  $('stState').textContent = stToken ? 'Connected to SmartThings.' : 'Not connected.';
  $('stForm').hidden = !!stToken;
  $('stList').hidden = !stToken;
  $('stClear').hidden = !stToken;
}
function wireSmart(): void {
  if (!isApp) return;
  $('stSave').onclick = async () => {
    const t = $<HTMLInputElement>('stToken').value.trim();
    if (!/^[\w-]{20,100}$/.test(t)) {
      $('stOut').textContent = 'That doesn’t look like a SmartThings token.';
      return;
    }
    const old = stToken;
    stToken = t;
    $('stOut').textContent = 'Checking…';
    try {
      const r = await stFetch('GET', '/devices');
      if (r.status !== 200) {
        stToken = old;
        $('stOut').textContent =
          r.status === 401 || r.status === 403
            ? 'SmartThings refused that token.'
            : `SmartThings said ${r.status}.`;
      } else {
        ls.set('alton-st', t);
        $<HTMLInputElement>('stToken').value = '';
        $('stOut').textContent = 'Connected. Try “turn the lamp off”.';
      }
    } catch {
      stToken = old;
      $('stOut').textContent = 'Couldn’t reach SmartThings.';
    }
    renderSmart();
  };
  $('stList').onclick = async () => {
    $('stOut').textContent = 'Loading…';
    $('stOut').textContent = await smartTool({ action: 'list' });
  };
  $('stClear').onclick = () => {
    stToken = '';
    ls.del('alton-st');
    $('stOut').textContent = '';
    renderSmart();
  };
}

/* ── Open shifts and trades (the shift app's Shift Trade tab) ── */
async function readTrades(): Promise<string> {
  if (!S.shiftApp) return 'No shift app chosen yet: the user picks it in Work › Your shift app.';
  if (!(await powerStatus())?.screenReader)
    return 'Reading the shift app (Accessibility) is switched off. The user turns it on in Settings › Phone access.';
  const tab = S.tradeTab || 'Shift Trade';
  toast(`Opening ${S.shiftAppName || 'your shift app'} to read ${tab}…`);
  try {
    const r = await Native.readApp({ package: S.shiftApp, tap: tab, weeks: 1 }).finally(
      () => void showReadLog(),
    );
    if (r.front && r.front !== S.shiftApp)
      return `The shift app didn't stay on screen (Alton saw ${r.front}).`;
    if (r.note)
      return `${r.note} Tell the user Alton couldn't find their shift app's "${tab}" tab, and that they can type its exact name in Work › Your shift app › Shift trades tab. What was on screen:\n${r.text.slice(0, 3000)}`;
    return `Text on the shift app's "${tab}" screen (read just now):\n${r.text.slice(0, 12000)}\n\nIf this is their own rota rather than shifts on offer, say the trades tab wasn't found. Otherwise call check_shift_fit with the shifts on offer (local times).`;
  } catch (e) {
    return `Couldn't read it: ${(e as Error).message}`;
  }
}
const fitOpts = (): FitOptions => ({
  rate: S.payRate,
  unpaidBreak: S.unpaidBreak,
  breakOver: S.breakAll ? 0 : 6,
  minRest: 11,
  maxWeek: 48,
  payNext: S.payNext,
  payCycle: S.payCycle,
  payLag: S.payLag,
});

/* ── Settings search: filters the groups and suggests features elsewhere ── */
function searchSettings(q: string): void {
  const view = $('setView');
  const query = q.trim().toLowerCase();
  const words = query.split(/\s+/).filter((w) => w.length > 1);
  let shown = 0;
  for (const g of view.querySelectorAll<HTMLDetailsElement>('details.grp')) {
    // Leave groups the app itself hid (e.g. phone-only ones in the browser).
    if (g.hidden && !g.dataset.searchHidden) continue;
    const hit = !words.length || words.some((w) => (g.textContent ?? '').toLowerCase().includes(w));
    g.hidden = !hit;
    if (hit) delete g.dataset.searchHidden;
    else g.dataset.searchHidden = '1';
    g.open = words.length > 0 && hit;
    if (hit) shown++;
  }
  for (const h of view.querySelectorAll<HTMLElement>('h2.set-h')) {
    let n = h.nextElementSibling;
    let any = false;
    while (n && !n.matches('h2.set-h')) {
      if (n.matches('details.grp') && !(n as HTMLElement).hidden) any = true;
      n = n.nextElementSibling;
    }
    h.hidden = words.length > 0 && !any;
  }
  const found = $('setFound');
  found.textContent = '';
  const feats = words.length
    ? findFeatures(query, undefined, 4).filter((f) => f.view !== 'set')
    : [];
  for (const f of feats) {
    const b = el('button', 'li');
    b.style.width = '100%';
    b.style.textAlign = 'left';
    b.appendChild(
      el('span', undefined, `${f.name} → ${f.where}${f.say ? ` · say “${f.say}”` : ''}`),
    );
    b.onclick = () => {
      $<HTMLInputElement>('setSearch').value = '';
      searchSettings('');
      setView(f.view);
    };
    found.appendChild(b);
  }
  found.hidden = !feats.length;
  $('setNone').hidden = !words.length || shown > 0 || feats.length > 0;
}

/* ── At work on a map ── */
let workMap: WorkMap | null = null;
function showWorkMap(): void {
  if (workMap || !isApp) return;
  const box = $('wkMap');
  const saved = S.workLat || S.workLon ? { lat: S.workLat, lon: S.workLon } : null;
  // No workplace yet: start at the phone's location (or the middle of the UK).
  workMap = mountWorkMap(box, saved ?? { lat: 52.48, lon: -1.9 }, {
    pin: saved,
    radius: S.workRadius,
    onPin: () => ($('wkMapMsg').textContent = 'Pin placed. Tap “Save this spot” to use it.'),
  });
  if (!saved && navigator.geolocation)
    navigator.geolocation.getCurrentPosition(
      (p) => workMap?.show(p.coords.latitude, p.coords.longitude),
      () => undefined,
      { timeout: 10_000, maximumAge: 600_000 },
    );
}
async function saveWorkplace(lat: number, lon: number, radius: number): Promise<void> {
  const r = await Native.setPlace({
    name: S.workName || 'work',
    lat,
    lon,
    radius,
    items: workItems(S.lists, S.workLists),
    listLabel: S.workLists.join(' & ') || 'Shopping',
  });
  S.workSet = true;
  S.workLat = lat;
  S.workLon = lon;
  S.workRadius = radius;
  if (!S.workName) S.workName = 'work';
  save();
  await renderWork();
  $('wkMapMsg').textContent = r.watching
    ? `Saved. Alton will show your list when you get to ${S.workName}.`
    : 'Saved. Now tap Allow and choose “Allow all the time”, so it works with Alton closed.';
  toast(r.watching ? 'Workplace saved.' : 'Saved: now allow location all the time.');
}
/** On opening Alton: check for ourselves whether we're at work (helps when Android's
 *  background check is slow or location isn't allowed all the time). */
function checkAtWorkNow(): void {
  if (!isApp || !S.workSet || !(S.workLat || S.workLon) || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const d = metresBetween(
        { lat: p.coords.latitude, lon: p.coords.longitude },
        { lat: S.workLat, lon: S.workLon },
      );
      const here = d <= S.workRadius + Math.min(150, p.coords.accuracy);
      void Native.placeCheck({ here }).catch(() => undefined);
      atWork = { here, since: Date.now() };
    },
    () => undefined,
    { timeout: 15_000, maximumAge: 120_000 },
  );
}

function wireShiftsTab(): void {
  $('shGetApp').onclick = () => {
    if (!S.shiftApp) {
      $('shGetMsg').textContent = 'First pick your shift app below in Your shift app.';
      return;
    }
    setView('chat');
    phoneOnlyNext = true;
    send(
      'Use the read_shift_app tool to read my shift app now, then add every upcoming shift with add_shifts.',
    );
  };
  $('shGetTrade').hidden = !isApp;
  $('shGetTrade').onclick = () => {
    if (!S.shiftApp) {
      $('shGetMsg').textContent = 'First pick your shift app below in Your shift app.';
      return;
    }
    setView('chat');
    phoneOnlyNext = true;
    send(
      'Use read_shift_trades to read the open shifts and trades in my shift app, then check_shift_fit, and tell me which ones fit around my rota and what they pay.',
    );
  };
  $('shGetPic').onclick = () => {
    setView('chat');
    $<HTMLTextAreaElement>('msg').value = 'Add the shifts from this rota screenshot.';
    $('photo').click();
    toast('Pick the screenshot of your rota, then tap send.');
  };
  $('shGetCal').onclick = () => {
    $('shForm').hidden = true;
    $('shCalRow').hidden = !$('shCalRow').hidden;
  };
  $('shCalGo').onclick = () => void shiftsFromMyCalendar();
  $<HTMLInputElement>('shWords').onchange = (e) => {
    S.shiftWords = (e.target as HTMLInputElement).value.trim() || 'shift, work';
    save();
  };
  $('shAddOpen').onclick = () => {
    if (!$('shForm').hidden && !editing) $('shForm').hidden = true;
    else editShift(null);
  };
  $('shSave').onclick = () => {
    const s = manualShift(
      $<HTMLInputElement>('shDate').value,
      $<HTMLInputElement>('shFrom').value,
      $<HTMLInputElement>('shTo').value,
      $<HTMLInputElement>('shTitle').value,
    );
    if (!s) return toast('Fill in the date, start and finish.');
    addShifts([s], editing ?? undefined);
    $('shGetMsg').textContent = `${editing ? 'Updated' : 'Saved'}: ${describeShift(s)}.`;
    editing = null;
    $('shForm').hidden = true;
  };
  $('calPrev').onclick = () => {
    calMonth =
      calMonth.m === 0 ? { y: calMonth.y - 1, m: 11 } : { y: calMonth.y, m: calMonth.m - 1 };
    renderCalendar();
  };
  $('calNext').onclick = () => {
    calMonth =
      calMonth.m === 11 ? { y: calMonth.y + 1, m: 0 } : { y: calMonth.y, m: calMonth.m + 1 };
    renderCalendar();
  };
  $('shShare').onclick = () => {
    const text = rotaText(S.shifts);
    void shareText('My shifts', text).then((ok) => {
      if (!ok) void navigator.clipboard?.writeText(text).then(() => toast('Rota copied.'));
    });
  };
  $('shToCal').onclick = async () => {
    const done = new Set(S.addedShifts);
    const todo = upcomingShifts(S.shifts).filter((x) => !done.has(shiftKey(x)));
    if (!todo.length) return toast('All your shifts are already in your calendar.');
    const out: { result: string; actions?: PhoneAction[]; shifts?: Shift[] } = {
      result: '',
      shifts: todo,
      actions: [{ marks: todo.map(shiftKey) } as unknown as PhoneAction],
    };
    await shiftsIntoCalendar(out, {});
    save();
    toast(
      out.result.startsWith('DONE')
        ? `Added ${todo.length} to your calendar.`
        : 'Allow Calendar in Settings › Phone access first.',
    );
  };
}

/* ── People › Snapchat friends: match Snapchat nicknames to who they are ── */
let snapFound: string[] = [];
function renderSnap(): void {
  $('snapCard').hidden = !isApp;
  if (!isApp) return;
  const box = $('snapList');
  box.textContent = '';
  for (const p of S.people.filter((x) => x.snap)) {
    const row = el('div', 'li');
    const t = el('span', undefined, `${p.snap} → `);
    t.style.flex = '1';
    t.appendChild(el('b', undefined, p.name));
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', `Forget ${p.snap}`);
    x.onclick = () => {
      S.people = S.people
        .map((q) => (q === p ? { ...q, snap: undefined } : q))
        .filter((q) => q.phone || q.email || q.snap);
      save();
      renderSnap();
    };
    row.append(t, x);
    box.appendChild(row);
  }
  const known = new Set(S.people.map((x) => x.snap?.toLowerCase()).filter(Boolean));
  const todo = $('snapTodo');
  todo.textContent = '';
  for (const nick of snapFound.filter((n) => !known.has(n.toLowerCase()))) {
    const row = el('div', 'li');
    row.style.flexWrap = 'wrap';
    const t = el('b', undefined, nick);
    t.style.flex = '1 1 100%';
    const inp = el('input', 'input') as HTMLInputElement;
    inp.placeholder = 'Who is this? (e.g. Sam)';
    inp.style.flex = '1';
    const ok = el('button', 'btn acc', 'Save');
    const skip = el('button', 'btn', 'Skip');
    ok.onclick = () => {
      const who = inp.value.trim() || nick;
      const i = S.people.findIndex((x) => x.name.toLowerCase() === who.toLowerCase());
      if (i >= 0) S.people[i] = { ...(S.people[i] as Person), snap: nick };
      else S.people.push({ name: who, snap: nick });
      save();
      renderSnap();
    };
    skip.onclick = () => {
      snapFound = snapFound.filter((n) => n !== nick);
      renderSnap();
    };
    row.append(t, inp, ok, skip);
    todo.appendChild(row);
  }
}
async function readSnapFriends(): Promise<void> {
  const st = await powerStatus();
  if (!st?.screenReader)
    return toast(
      'Turn on “Read my shift app” in Settings › Phone access first (Snapchat uses the same permission).',
    );
  toast('Opening Snapchat to read your chat list…');
  try {
    const r = await Native.readApp({ package: 'com.snapchat.android', tap: 'Chat' });
    snapFound = snapNames(r.text);
    renderSnap();
    toast(
      snapFound.length
        ? `Found ${snapFound.length} names: say who they are below.`
        : 'Didn’t find any names.',
    );
  } catch (e) {
    toast((e as Error).message);
  }
}

function renderPeople(): void {
  renderSnap();
  renderShifts();
  renderReminders();
  const box = $('peopleList');
  box.textContent = '';
  S.people.forEach((p) => {
    const row = el('div', 'li');
    const t = el('span', undefined, `${p.name} · ${p.phone ?? p.email ?? ''}`);
    t.style.flex = '1';
    const x = el('button', 'x', '✕');
    x.onclick = () => {
      S.people = S.people.filter((y) => y !== p);
      save();
      renderPeople();
    };
    row.append(t, x);
    box.appendChild(row);
  });
  if (!S.people.length) box.appendChild(el('p', 'muted', 'Nobody saved yet.'));
  const lists = $('lists');
  lists.textContent = '';
  // Add: "Shopping: milk, eggs" (no list name → To-do).
  const add = el('div', 'row');
  const inp = el('input', 'input');
  inp.placeholder = 'Add, e.g. “Shopping: milk, eggs”';
  const go = el('button', 'btn acc', 'Add');
  go.onclick = () => {
    const v = inp.value.trim();
    if (!v) return;
    const m = /^([^:]{1,40}):\s*(.+)$/.exec(v);
    const name = m?.[1]?.trim() ?? 'To-do';
    const items = (m?.[2] ?? v)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    let l = S.lists.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!l) {
      l = { name, items: [] };
      S.lists.push(l);
    }
    for (const text of items) {
      l.items.push({ text, done: false });
      S.newListItems.push({ list: name, text });
    }
    save();
    renderPeople();
  };
  add.append(inp, go);
  add.style.marginBottom = '8px';
  lists.appendChild(add);
  S.lists.forEach((l) => {
    const open = l.items.filter((i) => !i.done);
    if (!open.length || l.name === 'Alton roadmap') return;
    lists.appendChild(el('b', undefined, l.name));
    open.forEach((i) => {
      const row = el('div', 'li');
      const chk = el('button', 'check');
      chk.setAttribute('aria-label', `Tick off ${i.text}`);
      chk.onclick = () => {
        i.done = true;
        S.listOps.push({ list: l.name, text: i.text, op: 'done' });
        save();
        renderPeople();
        toast(`Ticked off ${i.text}`);
      };
      const t = el('span', undefined, i.text);
      t.style.flex = '1';
      const x = el('button', 'x', '✕');
      x.onclick = () => {
        l.items = l.items.filter((y) => y !== i);
        S.listOps.push({ list: l.name, text: i.text, op: 'remove' });
        save();
        renderPeople();
      };
      row.append(chk, t, x);
      lists.appendChild(row);
    });
  });
  if (lists.childNodes.length === 1)
    lists.appendChild(
      el('p', 'muted', 'Lists from the PC show here after a sync, or add one above.'),
    );
  const goals = $('goals');
  goals.textContent = '';
  S.goals.forEach((g) => {
    const row = el('div', 'li');
    const t = el('span', undefined, g.title);
    t.style.flex = '1';
    const bar = el('div', 'bar');
    bar.style.width = '90px';
    const fill = el('i');
    fill.style.width = `${g.progress}%`;
    bar.appendChild(fill);
    row.append(t, bar, el('span', 'muted', `${g.progress}%`));
    goals.appendChild(row);
  });
  if (!S.goals.length)
    goals.appendChild(
      el('p', 'muted', 'Goals from the PC show here after a sync. Ask “my goal is to…” on the PC.'),
    );
  const notes = $('notesList');
  notes.textContent = '';
  S.notes.slice(0, 30).forEach((n) => {
    const card = el('div', 'li');
    const body = el('div', 'md');
    body.style.flex = '1';
    body.innerHTML = md(n.length > 400 ? `${n.slice(0, 400)}…` : n);
    card.appendChild(body);
    notes.appendChild(card);
  });
  if (!S.notes.length) notes.appendChild(el('p', 'muted', 'No notes yet.'));
  const mems = $('mems');
  mems.textContent = '';
  S.memories.slice(-60).forEach((m) => {
    const row = el('div', 'li');
    const t = el('span', undefined, m);
    t.style.flex = '1';
    t.onclick = () => {
      const v = prompt('Edit memory', m)?.trim();
      if (!v || v === m) return;
      S.memories = S.memories.map((x) => (x === m ? v : x));
      S.newMemories = [...S.newMemories.filter((x) => x !== m), v];
      save();
      renderPeople();
    };
    const x = el('button', 'x', '✕');
    x.onclick = () => {
      S.memories = S.memories.filter((y) => y !== m);
      S.newMemories = S.newMemories.filter((y) => y !== m);
      save();
      renderPeople();
    };
    row.append(t, x);
    mems.appendChild(row);
  });
  if (!S.memories.length)
    mems.appendChild(
      el('p', 'muted', 'Sync from the PC to bring your memories over, or say “remember that…”.'),
    );
}

/* ── Today: work, what's coming up, weather, lists and the PC at a glance ── */
function renderToday(): void {
  if (S.weatherFx && (!nowWeather || Date.now() - nowWeather.at > 30 * 60_000))
    void refreshWeather();
  const now = new Date();
  const h = now.getHours();
  const hi = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('tdHello').textContent = `${hi}${S.userName ? `, ${S.userName.split(' ')[0]}` : ''}`;
  $('tdDate').textContent = now.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  // Work: on now, the next few shifts, and this week's hours (and pay, if set).
  const sh = $('tdShifts');
  sh.textContent = '';
  const cur = currentShift(S.shifts);
  if (cur) sh.appendChild(el('p', undefined, `🟢 At work now: ${describeShift(cur)}`));
  const next = upcomingShifts(S.shifts)
    .filter((x) => x !== cur)
    .slice(0, 3);
  for (const x of next) {
    const lb = leaveBy(x, S.travel);
    sh.appendChild(el('div', 'li', `${describeShift(x)}${lb ? ` · leave by ${lb}` : ''}`));
  }
  const hrs = weekHours(S.shifts);
  const pay = weekPay(S.shifts, S.payRate, S.unpaidBreak, new Date(), S.breakAll ? 0 : 6);
  if (hrs > 0)
    sh.appendChild(
      el('p', 'muted', `This week: ${hrs.toFixed(1)} h${pay > 0 ? ` · about ${money(pay)}` : ''}`),
    );
  if (!sh.childElementCount)
    sh.appendChild(
      el('p', 'muted', 'No shifts yet. Share a screenshot of your rota with Alton to add them.'),
    );
  else {
    const sl = sleepText();
    if (sl) sh.appendChild(el('p', 'muted', `😴 ${sl}`));
  }
  // Reminders.
  const rem = $('tdRems');
  rem.textContent = '';
  for (const r of S.reminders.filter((x) => x.at > Date.now()).slice(0, 4))
    rem.appendChild(
      el(
        'div',
        'li',
        `${new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · ${r.what}`,
      ),
    );
  $('tdRemCard').hidden = !rem.childElementCount;
  void renderTodaySpend();
  // Lists with things still to do.
  const lists = $('tdLists');
  lists.textContent = '';
  for (const l of S.lists) {
    const open = l.items.filter((i) => !i.done);
    if (!open.length) continue;
    const row = el('div', 'li');
    row.appendChild(
      el(
        'span',
        undefined,
        `${l.name} (${open.length}): ${open
          .slice(0, 3)
          .map((i) => i.text)
          .join(', ')}${open.length > 3 ? '…' : ''}`,
      ),
    );
    row.onclick = () => setView('people');
    lists.appendChild(row);
  }
  $('tdListsCard').hidden = !lists.childElementCount;
  // Weather (last check).
  const wb = $('tdWeather');
  wb.textContent = '';
  if (nowWeather) {
    const w = nowWeather;
    const top = el('div', 'wx-now');
    top.appendChild(el('span', 'wx-icon', wxIcon(w.code, w.isDay)));
    const t = el('div');
    t.appendChild(el('b', 'wx-temp', `${Math.round(w.temp)}°`));
    t.appendChild(el('span', 'muted', ` ${WMO[w.code] ?? ''}`));
    top.appendChild(t);
    wb.appendChild(top);
    const row = el('div', 'wx-days');
    for (const d of w.days.slice(0, 4)) {
      const c = el('div', 'wx-day');
      c.appendChild(
        el(
          'small',
          'muted',
          new Date(`${d.day}T12:00`).toLocaleDateString([], { weekday: 'short' }),
        ),
      );
      c.appendChild(el('span', 'wx-icon sm', wxIcon(d.code)));
      c.appendChild(el('small', undefined, `${Math.round(d.hi)}° / ${Math.round(d.lo)}°`));
      if (d.rain >= 30) c.appendChild(el('small', 'muted', `${d.rain}% 💧`));
      row.appendChild(c);
    }
    wb.appendChild(row);
    $('tdWeatherBtn').textContent = 'Refresh';
  } else wb.textContent = lastWeather || 'Tap below (uses your location once).';
  // PC.
  $('tdPc').textContent =
    pcLink === 'paired'
      ? `${S.pcName || 'PC'} is on and connected.${pcStatus?.playing ? ` Playing: ${pcStatus.playing}` : ''}`
      : pcLink === 'on'
        ? 'Your PC is on. Connect this phone in the PC tab.'
        : 'Your PC is off or out of reach. Alton works here on its own.';
  $('tdPlay').hidden = pcLink !== 'paired';
}
let lastWeather = '';

/* ── Remote control: the PC's screen live, tap to click, swipe to scroll, type ── */
let remoteOn = false;
let rmZoom = false;
let rmScreen = 0;
async function openRemote(): Promise<void> {
  const c = conn();
  if (!c) return toast('Connect to your PC first.');
  remoteOn = true;
  $('remote').hidden = false;
  $('rmStatus').textContent = 'Connecting…';
  void loadScreens();
  const img = $<HTMLImageElement>('rmImg');
  let frames = 0;
  let since = performance.now();
  let shown = 0;
  let seq = 0;
  let stop = false;
  // Three requests in flight at once: while one frame travels, the next ones are already asked
  // for (the PC hands each a newer frame than the last, so they don't bring repeats).
  const worker = async (): Promise<void> => {
    while (remoteOn && !stop) {
      const cc = conn();
      if (!cc) {
        $('rmStatus').textContent = 'Lost the connection to your PC.';
        return;
      }
      const mine = ++seq;
      try {
        const blob = await pcLive(cc, rmScreen || undefined);
        if (mine < shown || !remoteOn) continue;
        shown = mine;
        const url = URL.createObjectURL(blob);
        const old = img.src;
        img.src = url;
        await img.decode().catch(() => undefined);
        if (old.startsWith('blob:')) URL.revokeObjectURL(old);
        frames++;
        const now = performance.now();
        if (now - since > 2000) {
          $('rmStatus').textContent = `Live · ${Math.round((frames * 1000) / (now - since))} fps`;
          frames = 0;
          since = now;
        }
      } catch (e) {
        $('rmStatus').textContent = (e as Error).message;
        if (e instanceof PcError && e.status === 403) {
          stop = true;
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
/** Screen 1 / Screen 2 buttons when the PC has more than one monitor. */
async function loadScreens(): Promise<void> {
  const c = conn();
  const box = $('rmScreens');
  box.textContent = '';
  if (!c) return;
  try {
    const list = await pcApi<Array<{ id: number; label: string; current: boolean }>>(
      c,
      'GET',
      '/api/screens',
    );
    if (list.length < 2) return;
    for (const s of list) {
      const b = el('button', 'btn', s.label.replace(' (main)', ' ★'));
      b.classList.toggle('acc', rmScreen ? rmScreen === s.id : s.current);
      b.onclick = () => {
        rmScreen = s.id;
        box.querySelectorAll('button').forEach((x) => x.classList.remove('acc'));
        b.classList.add('acc');
      };
      box.appendChild(b);
    }
  } catch {
    /* older PC: one screen */
  }
}
function closeRemote(): void {
  remoteOn = false;
  $('remote').hidden = true;
  ($('rmType') as HTMLInputElement).blur();
}
/** Inputs go one after another, in order (a backspace must land before the letters after it). */
let rmQueue: Promise<unknown> = Promise.resolve();
function rmSend(cmd: Record<string, unknown>): void {
  const c = conn();
  if (!c) return;
  rmQueue = rmQueue.then(() => pcInput(c, cmd)).catch((e: Error) => toast(e.message));
}
function wireRemote(): void {
  const img = $<HTMLImageElement>('rmImg');
  const pos = (e: PointerEvent): { x: number; y: number } => {
    const r = img.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  let start: { x: number; y: number; cx: number; cy: number } | null = null;
  let moved = false;
  let long = false;
  let longTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollAcc = 0;
  let lastY = 0;
  let pendingClick: ReturnType<typeof setTimeout> | null = null;
  const ripple = (e: PointerEvent): void => {
    const d = el('i', 'rm-dot');
    const v = $('rmView').getBoundingClientRect();
    d.style.left = `${e.clientX - v.left + $('rmView').scrollLeft}px`;
    d.style.top = `${e.clientY - v.top + $('rmView').scrollTop}px`;
    $('rmView').appendChild(d);
    setTimeout(() => d.remove(), 450);
  };
  img.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    start = { ...p, cx: e.clientX, cy: e.clientY };
    moved = false;
    long = false;
    scrollAcc = 0;
    lastY = e.clientY;
    longTimer = setTimeout(() => {
      long = true;
      if ('vibrate' in navigator) navigator.vibrate(20);
    }, 550);
  });
  img.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (!moved && Math.hypot(e.clientX - start.cx, e.clientY - start.cy) > 12) {
      moved = true;
      if (!long && longTimer) clearTimeout(longTimer);
    }
    // One-finger swipe scrolls the PC (unless zoomed in, where it pans the picture).
    if (moved && !long && !rmZoom) {
      scrollAcc += e.clientY - lastY;
      lastY = e.clientY;
      const notches = Math.trunc(scrollAcc / 40);
      if (notches) {
        scrollAcc -= notches * 40;
        rmSend({ type: 'scroll', x: start.x, y: start.y, dy: notches });
      }
    }
  });
  img.addEventListener('pointerup', (e) => {
    if (longTimer) clearTimeout(longTimer);
    if (!start) return;
    const p = pos(e);
    const s = start;
    start = null;
    if (long && moved) return rmSend({ type: 'drag', x: s.x, y: s.y, x2: p.x, y2: p.y });
    if (moved) return;
    ripple(e);
    if (long) return rmSend({ type: 'right', x: s.x, y: s.y });
    // A second tap soon after = double-click.
    if (pendingClick) {
      clearTimeout(pendingClick);
      pendingClick = null;
      return rmSend({ type: 'double', x: s.x, y: s.y });
    }
    pendingClick = setTimeout(() => {
      pendingClick = null;
      rmSend({ type: 'click', x: s.x, y: s.y });
    }, 260);
  });
  img.addEventListener('contextmenu', (e) => e.preventDefault());
  document.querySelectorAll<HTMLButtonElement>('#remote [data-k]').forEach((b) => {
    b.onclick = () => rmSend({ type: 'key', keys: b.dataset.k });
  });
  // Phone keyboards (Samsung, Gboard) build each word up and re-send the whole word as you type
  // ("a", "ad", "add"), and autocorrect swaps words. So the box keeps what you've typed, and only
  // the difference from what the PC already has is sent: backspaces, then the new letters.
  const typer = $<HTMLInputElement>('rmType');
  let sent = '';
  const sync = (): void => {
    const d = typingDiff(sent, typer.value);
    for (let i = 0; i < d.back; i++) rmSend({ type: 'key', keys: 'backspace' });
    if (d.text) rmSend({ type: 'type', text: d.text });
    sent = typer.value;
  };
  let composing = false;
  const reset = (): void => {
    typer.value = '';
    sent = '';
  };
  $('rmKbd').onclick = () => typer.focus();
  typer.addEventListener('compositionstart', () => (composing = true));
  typer.addEventListener('compositionend', () => {
    composing = false;
    sync();
  });
  typer.addEventListener('input', () => {
    sync();
    // Keep the box short (between words) so long typing doesn't slow the comparison.
    if (!composing && typer.value.length > 60 && /\s$/.test(typer.value)) reset();
  });
  typer.addEventListener('beforeinput', (e) => {
    const ie = e as InputEvent;
    if (ie.inputType === 'insertLineBreak') {
      e.preventDefault();
      rmSend({ type: 'key', keys: 'enter' });
      reset();
    } else if (ie.inputType === 'deleteContentBackward' && !typer.value) {
      // Nothing left in the box: delete on the PC directly.
      e.preventDefault();
      rmSend({ type: 'key', keys: 'backspace' });
    }
  });
  typer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      rmSend({ type: 'key', keys: 'enter' });
      reset();
    } else if (e.key === 'Backspace' && !typer.value) {
      e.preventDefault();
      rmSend({ type: 'key', keys: 'backspace' });
    }
  });
  typer.addEventListener('blur', reset);
  $('rmZoom').onclick = () => {
    rmZoom = !rmZoom;
    $('rmView').classList.toggle('zoom', rmZoom);
    $('rmZoom').textContent = rmZoom ? 'Fit' : 'Zoom';
  };
  $('rmClose').onclick = closeRemote;
  $('remoteBtn').onclick = () => void openRemote();
}

/* ── Update the Alton project from the phone (the PC unpacks, commits and pushes) ── */
async function projectState(): Promise<void> {
  const c = conn();
  if (!c) return;
  try {
    const st = await pcApi<{ ready: boolean; dir: string }>(c, 'GET', '/api/project');
    $('projState').textContent = st.ready
      ? `Project folder on the PC: ${st.dir}. Pick the Alton zip and tap Update and push.`
      : 'First, on the PC: Settings › Privacy & safety › Phone companion › “Alton project folder”: paste the folder you push Alton from.';
  } catch (e) {
    $('projState').textContent = (e as Error).message;
  }
}
function wireProject(): void {
  $('projGo').onclick = async () => {
    const c = conn();
    const f = $<HTMLInputElement>('projFile').files?.[0];
    if (!c) return toast('Connect to your PC first.');
    if (!f || !/\.zip$/i.test(f.name)) return toast('Pick the Alton .zip first.');
    const log = $('projLog');
    const btn = $<HTMLButtonElement>('projGo');
    btn.disabled = true;
    log.textContent = `Sending ${f.name} to the PC…`;
    try {
      const saved = await pcUpload(c, f);
      log.textContent = 'Unpacking, committing and pushing on the PC… (up to a minute)';
      const r = await pcApi<{ ok: boolean; log: string }>(
        c,
        'POST',
        '/api/project/update',
        {
          file: saved,
          message: $<HTMLInputElement>('projMsg').value.trim() || `Alton update (${f.name})`,
        },
        300_000,
      );
      log.textContent = `${r.ok ? '✅ Done' : '⚠️ Didn’t finish'}\n${r.log}`;
      if (r.ok) toast('Pushed! The new version builds on GitHub now.');
    } catch (e) {
      log.textContent = `⚠️ ${(e as Error).message}`;
    } finally {
      btn.disabled = false;
    }
  };
}

/* ── Phone health check (Android app) ── */
async function runHealth(): Promise<void> {
  const box = $('healthOut');
  box.textContent = 'Checking…';
  try {
    const r = healthReport(await Native.diagnostics());
    box.textContent = '';
    if (r.issues.length) {
      box.appendChild(el('h3', 'sub', `Worth fixing (${r.issues.length})`));
      for (const i of r.issues) {
        const row = el('div', 'li');
        row.style.flexDirection = 'column';
        row.style.alignItems = 'stretch';
        row.appendChild(el('b', undefined, `⚠️ ${i.what}`));
        row.appendChild(el('small', 'muted', i.fix));
        box.appendChild(row);
      }
    } else box.appendChild(el('p', undefined, '✓ Nothing obviously wrong.'));
    box.appendChild(el('h3', 'sub', 'Readings'));
    for (const l of r.lines) box.appendChild(el('div', 'muted small', l));
  } catch (e) {
    box.textContent = `Couldn’t check: ${(e as Error).message}`;
  }
}
function wireHealth(): void {
  $('healthGrp').hidden = !isApp;
  if (!isApp) return;
  $('healthRun').onclick = () => void runHealth();
  $('healthAsk').onclick = () => {
    setView('chat');
    newChat(false);
    send(
      'Check my phone and tell me what’s slowing it down (my keyboard sometimes takes ages to pop up).',
    );
  };
}

/* ── PC tab ── */
function renderPc(): void {
  const tickBtn = (id: string, on: boolean): void => {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  };
  const inp = $<HTMLInputElement>('pcHttps');
  if (document.activeElement !== inp) inp.value = S.pcHttps;
  const ver = S.pcVersion ? ` (Alton ${S.pcVersion})` : '';
  $('pcState').textContent =
    pcLink === 'paired'
      ? `✓ Connected to ${S.pcName || 'your PC'}${ver}. Chats, lists, notes and shifts sync by themselves.`
      : pcLink === 'on'
        ? `Your PC is on${ver}, but this phone isn’t connected yet.`
        : 'Phone only: Alton works here on its own. Connect when your PC is on.';
  $('pcCheckMsg').textContent = pcLink === 'paired' ? '' : pcWhy;
  $('pairBox').hidden = pcLink === 'paired';
  $('unpairBtn').hidden = !pcToken();
  $('syncNow').hidden = pcLink !== 'paired';
  tickBtn('usePcToggle', S.usePc);
  $('syncInfo').textContent = S.lastPcSync
    ? `Last synced: ${new Date(S.lastPcSync).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
    : 'Not synced yet.';
  $('pcLive').hidden = pcLink !== 'paired';
  const macs = $('macs');
  macs.textContent = '';
  S.macs.forEach((m) => macs.appendChild(el('code', 'mac', m)));
  // The app wakes the PC itself (no other app needed).
  $('wakePc').hidden = !isApp || !S.macs.length;
  $('wakeHelp').textContent = isApp
    ? 'Works on your home Wi-Fi. Your PC’s address (from syncing):'
    : 'A sleeping PC can be woken from your phone with a free Wake-on-LAN app (Android: “Wake On Lan”; iPhone: “Mocha WOL”). Enter this PC address in the app:';
  $('wakePc').onclick = async () => {
    $('wakeMsg').textContent = 'Sending the wake-up signal…';
    try {
      for (const m of S.macs) await Native.wakeOnLan({ mac: m });
      $('wakeMsg').textContent =
        'Sent. Give it 10–30 seconds, then tap Check now. If it doesn’t wake, the PC needs Wake-on-LAN switched on (see below).';
      setTimeout(() => void checkPc(), 20_000);
    } catch (e) {
      $('wakeMsg').textContent = (e as Error).message;
    }
  };
  if (!S.macs.length) macs.textContent = 'Connect to the PC once to see it here.';
  renderPcStatus();
}
let projChecked = false;
function renderPcStatus(): void {
  if (!projChecked && pcLink === 'paired') {
    projChecked = true;
    void projectState();
  }
  const st = pcStatus;
  if (!st || pcLink !== 'paired') return;
  const pct = (x: number | null): string => (x == null ? '–' : `${Math.round(x)}%`);
  $('pcTitle').textContent = st.name || 'PC';
  $('cpu').textContent = pct(st.pc.cpu);
  $('mem').textContent = pct(st.pc.memPct);
  $('temp').textContent = st.pc.cpuTemp == null ? '–' : `${Math.round(st.pc.cpuTemp)}°`;
  $('pcExtra').textContent = [
    st.gaming ? `Gaming: ${st.gaming}` : '',
    st.pc.uptimeHours != null ? `Up ${st.pc.uptimeHours} h` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  $('playing').textContent = st.playing || 'Nothing playing';
  // Approvals waiting on the PC (sending, paying, deleting…): the tap here is the answer.
  const ap = $('approvals');
  ap.textContent = '';
  for (const a of st.approvals) {
    const box = el('div', 'li');
    box.style.flexDirection = 'column';
    box.style.alignItems = 'stretch';
    box.appendChild(el('b', undefined, a.title));
    if (a.detail) box.appendChild(el('p', 'muted', a.detail));
    const row = el('div', 'row');
    const yes = el('button', 'btn acc', 'Allow');
    const no = el('button', 'btn', 'Decline');
    yes.style.flex = no.style.flex = '1';
    yes.onclick = () => void pcPost('/api/approve', { id: a.id, ok: true });
    no.onclick = () => void pcPost('/api/approve', { id: a.id, ok: false });
    row.append(yes, no);
    box.appendChild(row);
    ap.appendChild(box);
  }
  $('approvalsCard').hidden = !st.approvals.length;
  // Agent Mode: what it's doing, and its question if it has one.
  const ag = $('agentBox');
  ag.textContent = '';
  const a = st.agent;
  if (a && /running|waiting|paused/.test(a.state)) {
    ag.appendChild(el('p', undefined, a.task));
    ag.appendChild(el('p', 'muted', `${a.state} · ${a.last}`));
    if (a.question) {
      ag.appendChild(el('p', undefined, `❓ ${a.question.text}`));
      const row = el('div', 'row');
      if (a.question.kind === 'confirm') {
        const y = el('button', 'btn acc', 'Yes');
        const n = el('button', 'btn', 'No');
        y.style.flex = n.style.flex = '1';
        y.onclick = () => void pcPost('/api/agent', { id: a.question?.id, answer: true });
        n.onclick = () => void pcPost('/api/agent', { id: a.question?.id, answer: false });
        row.append(y, n);
      } else {
        const inp = el('input', 'input');
        inp.placeholder = 'Your answer';
        inp.style.flex = '1';
        const go = el('button', 'btn acc', 'Send');
        go.onclick = () =>
          void pcPost('/api/agent', { id: a.question?.id, answer: inp.value || 'Done' });
        row.append(inp, go);
      }
      ag.appendChild(row);
    }
    const row2 = el('div', 'row');
    row2.style.margin = '6px 0 10px';
    const p = el('button', 'btn', a.state === 'paused' ? 'Resume' : 'Pause');
    const stop = el('button', 'btn red', 'Stop');
    p.style.flex = stop.style.flex = '1';
    p.onclick = () => void pcPost('/api/agent/pause', { on: a.state !== 'paused' });
    stop.onclick = () => void pcPost('/api/stop', {});
    row2.append(p, stop);
    ag.appendChild(row2);
  }
}
/* Routines (tap to run) and the PC's timers. */
let routinesLoaded = false;
async function refreshRoutinesTimers(c: PcConn): Promise<void> {
  if (!routinesLoaded) {
    try {
      const rs = await pcApi<Array<{ id: string; name: string; icon?: string }>>(
        c,
        'GET',
        '/api/routines',
      );
      const box = $('pcRoutines');
      box.textContent = '';
      for (const r of rs) {
        const b = el('button', 'btn', `${r.icon ? `${r.icon} ` : ''}${r.name}`);
        b.onclick = () => void pcAct('run_routine', r.id);
        box.appendChild(b);
      }
      if (!rs.length)
        box.appendChild(el('p', 'muted small', 'No routines yet (make them on the PC).'));
      routinesLoaded = true;
    } catch {
      /* older PC */
    }
  }
  try {
    renderTimers(await pcApi<TimerRow[]>(c, 'GET', '/api/timers'));
  } catch {
    /* ignore */
  }
}
type TimerRow = { id: string; label: string; dueAt: number; status: string };
function renderTimers(list: TimerRow[]): void {
  const box = $('pcTimers');
  box.textContent = '';
  for (const t of list) {
    const row = el('div', 'li');
    const mins = Math.max(0, Math.ceil((t.dueAt - Date.now()) / 60_000));
    const txt = el(
      'span',
      undefined,
      `${t.status === 'ringing' ? '🔔 ' : '⏱ '}${t.label || 'Timer'} · ${t.status === 'ringing' ? 'ringing' : `${mins} min left`}`,
    );
    txt.style.flex = '1';
    const x = el('button', 'x', '✕');
    x.setAttribute('aria-label', 'Cancel this timer');
    x.onclick = async () => {
      const c = conn();
      if (c)
        renderTimers(
          await pcApi<TimerRow[]>(c, 'POST', `/api/timers/${encodeURIComponent(t.id)}/cancel`, {}),
        );
    };
    row.append(txt, x);
    box.appendChild(row);
  }
}
async function refreshPcStatus(): Promise<void> {
  const c = conn();
  if (!c) return;
  try {
    pcStatus = await pcApi<PcStatus>(c, 'GET', '/api/status', undefined, 6000);
    renderPcStatus();
    void refreshRoutinesTimers(c);
  } catch {
    void checkPc();
  }
}
async function pcPost(path: string, body: unknown, done?: string): Promise<void> {
  const c = conn();
  if (!c) return toast('Not connected to the PC.');
  try {
    const r = await pcApi<{ message?: string }>(c, 'POST', path, body);
    toast(r.message || done || 'Done');
  } catch (e) {
    toast((e as Error).message);
  }
  void refreshPcStatus();
}
const pcAct = (action: string, target?: string): Promise<void> =>
  pcPost('/api/action', { action, ...(target ? { target } : {}) });
function wirePc(): void {
  $('pcChip').onclick = (e) => {
    e.stopPropagation(); // the bar itself opens Settings (spending)
    setView('pc');
  };
  $('pairGo').onclick = async () => {
    const base = $<HTMLInputElement>('pcHttps').value.trim().replace(/\/+$/, '');
    const code = $<HTMLInputElement>('pairCode').value.replace(/\D/g, '');
    if (!isPcAddress(base))
      return toast('Put your PC’s address in first, like https://palpatine.tail1234.ts.net');
    if (code.length !== 6) return toast('The code from the PC has 6 numbers.');
    S.pcHttps = base;
    save();
    $('pcCheckMsg').textContent = 'Connecting…';
    try {
      const r = await pairWithPc(base, code);
      ls.set(TOKEN_KEY, r.token);
      S.pcName = r.name;
      save();
      $<HTMLInputElement>('pairCode').value = '';
      pcWhy = '';
      await checkPc();
      toast(pcLink === 'paired' ? `Connected to ${r.name}.` : pcWhy);
    } catch (e) {
      $('pcCheckMsg').textContent =
        e instanceof PcError
          ? e.message
          : 'Couldn’t reach the PC. Is Tailscale on, and Alton up to date on the PC?';
    }
  };
  $('unpairBtn').onclick = () => {
    if (!confirm('Disconnect this phone from the PC? You can connect again with a new code.'))
      return;
    ls.del(TOKEN_KEY);
    pcStatus = null;
    void checkPc();
  };
  $('pcCheck').onclick = async () => {
    $('pcCheckMsg').textContent = 'Checking…';
    await checkPc();
    renderPc();
    if (pcLink === 'paired') toast('Connected ✓');
  };
  $('syncNow').onclick = () => void syncWithPc(true);
  $('usePcToggle').onclick = () => {
    S.usePc = !S.usePc;
    save();
    renderPc();
  };
  document.querySelectorAll<HTMLButtonElement>('#pcLive [data-tm]').forEach((b) => {
    b.onclick = async () => {
      const c = conn();
      if (!c) return;
      try {
        renderTimers(
          await pcApi<TimerRow[]>(c, 'POST', '/api/timers', {
            minutes: Number(b.dataset.tm),
            label: 'From my phone',
          }),
        );
        toast(`Timer set on the PC for ${b.textContent?.trim()}.`);
      } catch (e) {
        toast((e as Error).message);
      }
    };
  });
  document.querySelectorAll<HTMLButtonElement>('#pcLive [data-m]').forEach((b) => {
    b.onclick = () => void pcAct('media_control', b.dataset.m);
  });
  $<HTMLInputElement>('pcVol').onchange = (e) =>
    void pcAct('set_volume', (e.target as HTMLInputElement).value);
  let muted = false;
  $('muteBtn').onclick = () => {
    muted = !muted;
    $('muteBtn').textContent = muted ? 'Unmute' : 'Mute';
    void pcAct('set_volume', muted ? 'mute' : 'unmute');
  };
  $('lockBtn').onclick = () => {
    if (confirm('Lock the PC?')) void pcAct('lock_screen');
  };
  $('screenBtn').onclick = async () => {
    const c = conn();
    if (!c) return;
    try {
      const img = $<HTMLImageElement>('screenImg');
      if (img.src) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(await pcScreen(c));
      img.hidden = false;
    } catch (e) {
      toast((e as Error).message);
    }
  };
  $('agentGo').onclick = () => {
    const t = $<HTMLInputElement>('agentTask').value.trim();
    if (!t) return toast('Say what Alton should do on the PC.');
    $<HTMLInputElement>('agentTask').value = '';
    void pcPost('/api/agent/start', { task: t }, 'Agent Mode started on the PC.');
  };
  const power = (action: string, ask?: string, extra: Record<string, string> = {}): void => {
    if (ask && !confirm(ask)) return;
    void pcPost('/api/power', { action, ...extra });
  };
  $('offBtn').onclick = () =>
    power('shutdown', 'Shut down the PC in 1 minute? Unsaved work will be lost.');
  $('restartBtn').onclick = () => power('restart', 'Restart the PC in 1 minute?');
  $('cancelOffBtn').onclick = () => power('cancel');
  $('dlBtn').onclick = () => power('download');
  $('dlStopBtn').onclick = () => power('download-off');
  $('dlOffBtn').onclick = () =>
    power(
      'download',
      'Download mode, then shut the PC down when Steam finishes? You can’t turn it back on from the phone.',
      { then: 'shutdown' },
    );
  $('sleepBtn').onclick = () => {
    if (confirm('Put the PC to sleep? Wake it with a Wake-on-LAN app or its power button.'))
      void pcPost('/api/sleep', {}, 'The PC is going to sleep.');
  };
  $<HTMLInputElement>('pcFile').onchange = async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    const c = conn();
    if (!f || !c) return;
    $('pcFileMsg').textContent = `Sending ${f.name}…`;
    try {
      const saved = await pcUpload(c, f);
      $('pcFileMsg').textContent = `Sent ✓ Saved as ${saved} in Downloads › From phone.`;
    } catch (e2) {
      $('pcFileMsg').textContent = (e2 as Error).message;
    }
    input.value = '';
  };
  // Keep the PC tab live while it's open.
  setInterval(() => {
    if (view === 'pc' && pcLink === 'paired' && !document.hidden) void refreshPcStatus();
  }, 5000);
}

/* ── Settings ── */
function renderSettings(): void {
  $<HTMLSelectElement>('model').value = S.model;
  $<HTMLInputElement>('userName').value = S.userName;
  $<HTMLInputElement>('country').value = S.country;
  const tick = (id: string, on: boolean): void => {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  };
  tick('speakToggle', S.speak);
  tick('autoToggle', S.autoSend);
  tick('saverToggle', S.saver);
  renderVoiceSettings();
  $('pinBtn').textContent = S.pinHash ? 'Remove PIN lock' : 'Set a PIN lock';
  $('setInitial').textContent = (S.userName || S.name).slice(0, 1).toUpperCase();
  $('setName').textContent = S.userName || 'You';
  $('setSub').textContent = `${S.name} on this phone · ${
    S.model.includes('opus') ? 'Opus' : S.model.includes('sonnet') ? 'Sonnet' : 'Haiku'
  }${S.saver ? ' · saver' : ''}`;
  $<HTMLInputElement>('pcHttps').value = S.pcHttps;
  const u = summarise(S.usage, S.budget);
  $('spendToday').textContent = fmtUsd(u.today);
  $('spendMonth').textContent = fmtUsd(u.month);
  $<HTMLInputElement>('budget').value = S.budget ? String(budgetInGbp(S.budget)) : '';
}

async function checkKey(k: string): Promise<string | null> {
  if (!/^sk-ant-[\w-]{20,}$/.test(k))
    return 'That doesn’t look like an Anthropic key (it starts with sk-ant-).';
  try {
    await new Anthropic({ apiKey: k, dangerouslyAllowBrowser: true }).models.list({ limit: 1 });
    return null;
  } catch (err) {
    return err instanceof Anthropic.AuthenticationError
      ? 'Anthropic says that key isn’t valid.'
      : 'Couldn’t reach Anthropic. Check your internet.';
  }
}

/* ── Wiring ── */
function setView(v: string): void {
  view = v;
  for (const x of ['chat', 'today', 'work', 'people', 'pc', 'set'])
    $(`${x}View`).classList.toggle('on', x === v);
  document
    .querySelectorAll('nav.tabs button')
    .forEach((b) => b.classList.toggle('on', b.getAttribute('data-v') === v));
  for (const id of ['menuBtn', 'newBtn', 'researchBtn', 'handsBtn', 'shareBtn'])
    $(id).style.display = v === 'chat' ? '' : 'none';
  $('title').textContent =
    v === 'chat'
      ? chat()
        ? cleanTitle(chat()?.title ?? '')
        : S.name
      : v === 'today'
        ? 'Today'
        : v === 'work'
          ? 'Work'
          : v === 'people'
            ? 'Lists'
            : v === 'pc'
              ? 'PC'
              : 'Settings';
  if (v === 'people') renderPeople();
  if (v === 'work') {
    renderShifts();
    void showReadLog();
    renderSleep();
    void renderPowers();
  }
  if (v === 'today') renderToday();
  if (v === 'pc') renderPc();
  if (v === 'set') {
    renderSettings();
    void renderMsgStatus();
    renderSmart();
    void renderSpendSettings();
    renderAbout();
    renderLook();
    renderUiSettings();
    renderPersonality();
    renderPrompts();
    void renderPowers();
  }
  if (v === 'chat') renderMsgs();
}

function start(): void {
  document.documentElement.classList.toggle('is-app', isApp);
  const ready = !!apiKey;
  $('setup').hidden = ready;
  $('app').hidden = !ready;
  $('app').style.display = ready ? 'contents' : 'none';
  if (ready) {
    setView(view);
    applyLook();
    renderSpend();
    lockNow();
    void checkPc();
    void checkUpdate();
    void takeLaunchParams();
    void flushQueue();
  }
}

/** Home-screen shortcuts (?new, ?talk, ?q=, ?brief) and things shared from other apps (?shared). */
async function takeLaunchParams(): Promise<void> {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return;
  history.replaceState(null, '', location.pathname);
  if (p.has('new')) {
    newChat(false);
    renderMsgs();
  }
  if (p.has('brief')) {
    newChat(false);
    send('Brief me');
  }
  if (p.has('talk')) toggleMic();
  if (p.has('shifts')) {
    newChat(false);
    renderMsgs();
    askForShifts(false);
  }
  const q = p.get('q');
  if (q) {
    const ta = $<HTMLTextAreaElement>('msg');
    ta.value = q;
    ta.focus();
  }
  if (p.has('shared') && 'caches' in window) {
    const cache = await caches.open('alton-shared');
    const text = (await (await cache.match('./shared/text'))?.text()) ?? '';
    const count = Number((await (await cache.match('./shared/count'))?.text()) ?? '0');
    for (let i = 0; i < count; i++) {
      const blob = await (await cache.match(`./shared/file-${i}`))?.blob();
      if (blob) {
        const file = new File([blob], `shared-${i}.jpg`, { type: blob.type });
        const [big, small] = await Promise.all([shrink(file, 1568, 0.82), shrink(file, 160, 0.7)]);
        pending.push({ data: big.slice(big.indexOf(',') + 1), thumb: small });
      }
    }
    for (const k of ['text', 'count', 'file-0', 'file-1', 'file-2', 'file-3'])
      await cache.delete(`./shared/${k}`);
    newChat(false);
    renderMsgs();
    renderThumbs();
    const ta = $<HTMLTextAreaElement>('msg');
    ta.value = text ? `${text}\n\n` : '';
    ta.placeholder = count
      ? 'What should I do with this? (e.g. add these shifts to my calendar)'
      : 'What should I do with this? (e.g. summarise it)';
    ta.focus();
  }
}

function wire(): void {
  $('shareBtn').onclick = shareChat;
  $('camBtn').onclick = () => void openCamera();
  $('camClose').onclick = closeCamera;
  $('camShoot').onclick = () => void shootAndAsk($<HTMLInputElement>('camText').value);
  $('camText').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter')
      void shootAndAsk($<HTMLInputElement>('camText').value);
  });
  $('mode').onclick = () => setView('set');
  $<HTMLSelectElement>('voicePick').onchange = (e) => {
    S.voiceName = (e.target as HTMLSelectElement).value;
    save();
    say('This is how I sound now.', true);
  };
  $<HTMLInputElement>('voiceRate').onchange = (e) => {
    S.voiceRate = Math.min(1.6, Math.max(0.6, Number((e.target as HTMLInputElement).value) || 1));
    save();
    say('This is how fast I talk now.', true);
  };
  $('notifyAllow').onclick = () => {
    if (!('Notification' in window)) return toast('This browser can’t show notifications.');
    void Notification.requestPermission().then((p) =>
      toast(
        p === 'granted' ? 'Alton can notify you while it’s open.' : 'Notifications are blocked.',
      ),
    );
  };
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => renderVoiceSettings();
  installSpeechShim();
  updateSpeechVocab();
  void loadVoices().then(() => renderVoiceSettings());
  scheduleReminderPings();
  // PC on/off checks while the app is open, and the lock after 5 minutes away.
  setInterval(() => {
    if (!document.hidden) void checkPc();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else {
      if (S.pinHash && hiddenAt && Date.now() - hiddenAt > 5 * 60_000) lockNow();
      void checkPc();
      if (hiddenAt && Date.now() - hiddenAt > 10 * 60_000) void checkUpdate();
    }
  });
  $('pinGo').onclick = () => void tryUnlock();
  $('pinInput').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void tryUnlock();
  });
  $('pinForgot').onclick = () => {
    if (
      !confirm(
        'Forgot the PIN? This removes the lock AND your Claude key from this phone (your chats stay). You will need to paste the key again.',
      )
    )
      return;
    S.pinHash = '';
    S.pinSalt = '';
    save();
    apiKey = '';
    ls.del('alton-key');
    ls.del('alton-st');
    $('lock').hidden = true;
    start();
  };
  $('pinBtn').onclick = () => void setPin();
  $<HTMLInputElement>('pcHttps').onchange = (e) => {
    const v = (e.target as HTMLInputElement).value.trim().replace(/\/+$/, '');
    if (v && !/^https:\/\/[\w.-]+\.ts\.net(:\d+)?$/.test(v))
      return toast('That should look like https://palpatine.tail1234.ts.net');
    S.pcHttps = v;
    save();
    void checkPc();
    renderPc();
  };
  $('saverToggle').onclick = () => {
    S.saver = !S.saver;
    save();
    renderSettings();
    renderSpend();
    toast(S.saver ? 'Saver mode on: cheaper replies.' : 'Saver mode off.');
  };
  // Keep the shift card's countdown fresh.
  setInterval(() => {
    if (!document.hidden && (view === 'chat' || view === 'today')) renderShiftCard();
  }, 60_000);
  wireShiftsTab();
  wireSleep();
  wireSpend();
  wireSmart();
  $<HTMLInputElement>('setSearch').oninput = (e) =>
    searchSettings((e.target as HTMLInputElement).value);
  $('shiftLead').onchange = () => {
    const v = Number($<HTMLInputElement>('shiftLead').value);
    S.shiftLead = v >= 0 && v <= 600 ? Math.round(v) : 90;
    save();
    renderShifts();
  };
  const num = (id: string, max: number): number => {
    const v = Number($<HTMLInputElement>(id).value.replace(',', '.'));
    return v > 0 && v <= max ? Math.round(v * 100) / 100 : 0;
  };
  $('payRate').onchange = () => {
    S.payRate = num('payRate', 1000);
    save();
    renderShifts();
  };
  $('unpaidBreak').onchange = () => {
    S.unpaidBreak = Math.round(num('unpaidBreak', 180));
    save();
    renderShifts();
  };
  $<HTMLInputElement>('payNext').onchange = (e) => {
    S.payNext = (e.target as HTMLInputElement).value;
    save();
    renderShifts();
  };
  $<HTMLSelectElement>('payCycle').onchange = (e) => {
    const v = Number((e.target as HTMLSelectElement).value);
    S.payCycle = (v === 7 || v === 14 || v === 0 ? v : 28) as PayCycle;
    save();
    renderShifts();
  };
  $('payLag').onchange = () => {
    S.payLag = Math.round(num('payLag', 60));
    save();
    renderShifts();
  };
  $('payToCal').onclick = async () => {
    if (!S.payNext) return;
    const from = new Date();
    const to = new Date(from.getFullYear() + 1, from.getMonth(), from.getDate());
    const days = paydays(S.payNext, S.payCycle, from, to).filter(
      (d) => !S.paydaysAdded.includes(d),
    );
    if (!days.length) return toast('Your paydays are already in your calendar.');
    const st = await powerStatus();
    if (!st?.calendar) {
      const r = await Native.requestAccess({ which: 'calendar' }).catch(() => ({ granted: false }));
      if (!r.granted) return toast('Allow Calendar in Settings › Phone access first.');
    }
    try {
      const { added } = await Native.addEvents({
        events: days.map((d) => ({
          title: '💷 Payday',
          start: new Date(`${d}T09:00`).getTime(),
          end: new Date(`${d}T09:15`).getTime(),
          location: '',
          notes: 'Added by Alton',
          remindMinutes: 0,
        })),
      });
      S.paydaysAdded = [...new Set([...S.paydaysAdded, ...days])].slice(-60);
      save();
      toast(`Added ${added} payday${added === 1 ? '' : 's'} to your calendar.`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  $<HTMLSelectElement>('breakAll').onchange = (e) => {
    S.breakAll = (e.target as HTMLSelectElement).value === '1';
    save();
    renderShifts();
  };
  $('travel').onchange = () => {
    S.travel = Math.round(num('travel', 300));
    save();
    renderShifts();
  };
  $('backupBtn').onclick = backup;
  $<HTMLInputElement>('restoreFile').onchange = (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (f) void restore(f);
  };
  $('restoreBtn').onclick = () => $('restoreFile').click();
  $('shiftRules').onchange = () => {
    const raw = $<HTMLInputElement>('shiftRules').value;
    S.shiftRules = parseAlarmRules(raw);
    save();
    renderShifts();
    if (raw.trim() && !S.shiftRules.length) toast('Write them like 07:00=05:45, 12:00=10:00');
  };
  $('msg').addEventListener('input', renderSlash);
  window.addEventListener('online', () => {
    if (S.queue.length) toast('Back online: sending what was waiting.');
    void flushQueue();
  });
  document.querySelectorAll('nav.tabs button').forEach((b) => {
    (b as HTMLButtonElement).onclick = () => setView(b.getAttribute('data-v') ?? 'chat');
  });
  $('keySave').onclick = async () => {
    const k = $<HTMLInputElement>('keyInput').value.trim();
    $('keyMsg').textContent = 'Checking…';
    const err = await checkKey(k);
    if (err) {
      $('keyMsg').textContent = err;
      return;
    }
    apiKey = k;
    ls.set('alton-key', k);
    $<HTMLInputElement>('keyInput').value = '';
    start();
  };
  $('keyChange').onclick = () => {
    apiKey = '';
    ls.del('alton-key');
    start();
  };
  $('menuBtn').onclick = openDrawer;
  $('scrim').onclick = closeDrawer;
  $('chatSearch').oninput = (e) => renderChatList((e.target as HTMLInputElement).value);
  $('newBtn').onclick = () => {
    newChat(false);
    renderMsgs();
  };
  $('dNew').onclick = () => {
    newChat(false);
    closeDrawer();
    renderMsgs();
  };
  $('dResearch').onclick = () => {
    newChat(true);
    closeDrawer();
    renderMsgs();
  };
  $('researchBtn').onclick = () => {
    research = !research;
    const c = chat();
    if (c) c.research = research;
    save();
    renderMsgs();
    toast(research ? 'Research mode: deeper web searches, fuller answers' : 'Research mode off');
  };
  const ta = $<HTMLTextAreaElement>('msg');
  ta.oninput = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
  };
  ta.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) {
      e.preventDefault();
      send();
    }
  };
  $('sendBtn').onclick = () => (busy ? busy.abort() : send());
  const mic = $('micBtn');
  mic.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    micDown();
  });
  mic.addEventListener('pointerup', micUp);
  mic.addEventListener('pointercancel', micUp);
  mic.addEventListener('contextmenu', (e) => e.preventDefault());
  $('attachBtn').onclick = () => $('photo').click();
  $<HTMLInputElement>('photo').onchange = (e) => {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])].slice(0, 4 - pending.length);
    input.value = '';
    for (const f of files) {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        void readPdf(f).then(
          (data) => {
            pending.push({ data, thumb: PDF_THUMB });
            renderThumbs();
          },
          (err: Error) => toast(err.message),
        );
        continue;
      }
      void Promise.all([shrink(f, 1568, 0.82), shrink(f, 160, 0.7)]).then(
        ([big, small]) => {
          pending.push({ data: big.slice(big.indexOf(',') + 1), thumb: small });
          renderThumbs();
        },
        (err: Error) => toast(err.message),
      );
    }
  };
  $('pickContact').onclick = () => void pickContact();
  $('pAdd').onclick = () => {
    const name = $<HTMLInputElement>('pName').value.trim();
    const phone = $<HTMLInputElement>('pPhone').value.trim();
    if (!name || !phone) return toast('Type a name and a number.');
    S.people = [
      ...S.people.filter((x) => x.name.toLowerCase() !== name.toLowerCase()),
      { name, phone },
    ];
    $<HTMLInputElement>('pName').value = '';
    $<HTMLInputElement>('pPhone').value = '';
    save();
    renderPeople();
  };
  wirePc();
  wireLook();
  wireRemote();
  wireProject();
  wireHealth();
  $('snapRead').onclick = () => void readSnapFriends();
  wireUi();
  wireVoiceSource();
  wireLock();
  wireWatch();
  wireMessages();
  sendPcLink(true);
  // "While you were away": note when the app is put away, show the card on return (30+ min).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      S.awayAt = Date.now();
      save();
      return;
    }
    if (S.awayAt && Date.now() - S.awayAt >= 30 * 60_000) void showCatchup(S.awayAt);
    void refreshMsgDigest();
    sendPcLink(true);
  });
  void refreshMsgDigest();
  wireMoney();
  wirePowers();
  wireDriving();
  // The background follows the time of day, and the weather where you are.
  setInterval(applyAmbient, 10 * 60_000);
  void navigator.permissions
    ?.query({ name: 'geolocation' as PermissionName })
    .then((p) => {
      if (p.state === 'granted' || isApp) void refreshWeather();
    })
    .catch(() => undefined);
  setInterval(() => {
    if (!document.hidden && S.weatherFx) void refreshWeather();
  }, 30 * 60_000);
  // People & lists: one section at a time (remembered).
  const seg = (k: string): void => {
    $('peopleView').dataset.seg = k;
    document
      .querySelectorAll<HTMLButtonElement>('.seg button')
      .forEach((b) => b.classList.toggle('on', b.dataset.seg === k));
    ls.set('alton-seg', k);
  };
  document.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => {
    b.onclick = () => seg(b.dataset.seg ?? 'lists');
  });
  // (Shifts moved to their own Work tab.)
  const savedSeg = ls.get('alton-seg');
  seg(savedSeg && savedSeg !== 'shifts' ? savedSeg : 'lists');
  // A dot on Today when the shift card or the backup reminder wants attention.
  const dot = (): void => {
    const on = !$('shiftCard').hidden || !$('backupNudge').hidden;
    document.querySelector('nav.tabs button[data-v="today"]')?.classList.toggle('ping', on);
  };
  const mo = new MutationObserver(dot);
  for (const id of ['shiftCard', 'backupNudge'])
    mo.observe($(id), { attributes: true, attributeFilter: ['hidden'] });
  dot();
  $('tdPcOpen').onclick = () => setView('pc');
  $('tdWorkOpen').onclick = () => setView('work');
  // Today › Alarm: phone and/or Alexa
  const tick = (id: string, on: boolean): void => {
    $(id).classList.toggle('on', on);
    $(id).textContent = on ? '✓' : '';
  };
  let alPhone = true;
  let alAlexa = S.alarmAlexa;
  tick('alPhone', alPhone);
  tick('alAlexa', alAlexa);
  $('alPhone').onclick = () => tick('alPhone', (alPhone = !alPhone));
  $('alAlexa').onclick = () => tick('alAlexa', (alAlexa = !alAlexa));
  $('alSet').onclick = async () => {
    const v = $<HTMLInputElement>('alTime').value;
    const m = /^(\d{2}):(\d{2})$/.exec(v);
    if (!m) return toast('Pick a time first.');
    if (!alPhone && !alAlexa) return toast('Choose the phone, Alexa, or both.');
    const label = $<HTMLInputElement>('alLabel').value.trim();
    if (alPhone) await setAlarmEverywhere(Number(m[1]), Number(m[2]), label, alAlexa);
    else alexaDo(`set an alarm for ${spokenTime(v)}`);
  };
  $('tdPlay').onclick = () => void pcAct('media_control', 'play_pause');
  $('tdWeatherBtn').onclick = async () => {
    if (await refreshWeather(true)) return renderToday();
    $('tdWeather').textContent = 'Checking…';
    const r = await placeTool('get_weather', {});
    lastWeather = (r?.result ?? 'Couldn’t get the weather.').replace(
      /^Weather for where the user is: /,
      '',
    );
    renderToday();
  };
  $('updateBar').onclick = () => void applyUpdate();
  $('updCheck').onclick = () => {
    $('updMsg').textContent = 'Checking…';
    void checkUpdate(true);
  };
  setInterval(() => void checkUpdate(), 60 * 60_000);
  $('handsBtn').onclick = () => setHandsFree(!handsFree);
  $('noteAdd').onclick = () => {
    const v = $<HTMLInputElement>('noteInput').value.trim();
    if (!v) return;
    S.notes.unshift(v);
    S.newNotes.push(v);
    $<HTMLInputElement>('noteInput').value = '';
    save();
    renderPeople();
  };
  $<HTMLInputElement>('budget').onchange = (e) => {
    S.budget = budgetFromGbp(Math.max(0, Number((e.target as HTMLInputElement).value) || 0));
    save();
    renderSettings();
    renderSpend();
  };
  $<HTMLSelectElement>('model').onchange = (e) => {
    S.model = (e.target as HTMLSelectElement).value;
    save();
  };
  $<HTMLInputElement>('userName').onchange = (e) => {
    S.userName = (e.target as HTMLInputElement).value.trim();
    save();
  };
  $<HTMLInputElement>('country').onchange = (e) => {
    S.country = (e.target as HTMLInputElement).value.replace(/\D/g, '') || '44';
    save();
  };
  $('speakToggle').onclick = () => {
    S.speak = !S.speak;
    save();
    renderSettings();
  };
  $('autoToggle').onclick = () => {
    S.autoSend = !S.autoSend;
    save();
    renderSettings();
  };
  $('wipe').onclick = () => {
    if (!confirm('Remove your key, chats, people and memories from this phone?')) return;
    ls.del('alton-key');
    ls.del('alton-st');
    ls.del(KEY);
    location.reload();
  };
}

/* ── Keyboard: keep what you're typing in view ── */
// The Android app reports the covered height itself (MainActivity → --kb, 'altonkb'). In a
// browser, work it out from the visual viewport (for browsers that overlay the keyboard).
function keepTypingInView(): void {
  const a = document.activeElement as HTMLElement | null;
  if (view === 'chat') {
    const m = $('main');
    m.scrollTop = m.scrollHeight;
  } else if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
    a.scrollIntoView({ block: 'center' });
}
window.addEventListener('altonkb', () => requestAnimationFrame(keepTypingInView));
if (!isApp && window.visualViewport) {
  const vv = window.visualViewport;
  const onVv = (): void => {
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const d = document.documentElement;
    const kb = covered > 80 ? covered : 0;
    if (d.style.getPropertyValue('--kb') === `${kb}px`) return;
    d.style.setProperty('--kb', `${kb}px`);
    d.classList.toggle('kb', kb > 0);
    requestAnimationFrame(keepTypingInView);
  };
  vv.addEventListener('resize', onVv);
}
// Repaint a space background at the new size after turning the phone or resizing.
let spaceResize: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(spaceResize);
  spaceResize = setTimeout(() => isSpaceArt(S.bg) && paintSpace(document.body, S.bg), 400);
});
takeHash();
wire();
start();
if ('serviceWorker' in navigator && !isApp)
  void navigator.serviceWorker.register('./sw.js').catch(() => undefined);

/* ── Money: payslip check, selling, spending check, price watching (Work › Money) ── */
let moneyNext = false;
/** Start a money job in the chat: fill the prompt, and pick a photo/PDF when it needs one. */
function moneyAsk(text: string, pick: boolean): void {
  setView('chat');
  moneyNext = true;
  const ta = $<HTMLTextAreaElement>('msg');
  ta.value = text;
  if (pick) {
    toast('Pick a photo, screenshot or PDF.');
    $('photo').click();
  } else send();
}
function wireMoney(): void {
  $('mnSlip').onclick = () =>
    moneyAsk(
      'Check my payslip: read it (pay period, hours, rate, gross, tax, NI, pension, net, holiday) and use save_payslip, then tell me any differences in plain words.',
      true,
    );
  $('mnSell').onclick = () =>
    moneyAsk(
      'Help me sell this: write a Vinted listing (or eBay if it suits better) with make_listing, and suggest a price from what similar items sold for.',
      true,
    );
  $('mnSpend').onclick = () => {
    if (isApp && S.spendApps.length)
      return moneyAsk('Do a spending check (spending_check) and give me plain suggestions.', false);
    moneyAsk(
      'Do a spending check on this bank statement: subscriptions and repeat payments, price rises, the biggest categories this month, and plain suggestions.',
      true,
    );
  };
  $('mnWatch').onclick = () => {
    setView('chat');
    moneyNext = true;
    const ta = $<HTMLTextAreaElement>('msg');
    ta.value = 'Watch the price of ';
    ta.focus();
    toast('Paste a link or type what it is, then send.');
  };
  $('mnOffers').onclick = () =>
    moneyAsk(
      'Check my Shopping list (get_lists) against Morrisons offers this week (search the web) and tell me which items are on offer and the deal. Keep it short.',
      false,
    );
  // Prices: check about once a day, when the app is opened or comes back.
  void checkPrices();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkPrices();
  });
}

function renderMoney(): void {
  const slips = $('mnSlips');
  slips.textContent = '';
  const hist = (S.payslips ?? []).slice(-4).reverse();
  if (hist.length) {
    slips.appendChild(el('div', 'muted', 'Payslips'));
    for (const p of hist) {
      const d = el('div', 'li');
      d.appendChild(
        el(
          'span',
          undefined,
          `${p.payDate || p.periodEnd}: ${p.hours ?? '?'}h · ${p.gross != null ? money(p.gross) : '?'} gross · tax ${p.tax != null ? money(p.tax) : '?'} · NI ${p.ni != null ? money(p.ni) : '?'} · ${p.net != null ? money(p.net) : '?'} net`,
        ),
      );
      slips.appendChild(d);
    }
    const hol = hist.find((p) => p.holidayHours != null)?.holidayHours;
    if (hol != null) slips.appendChild(el('div', 'muted', `Holiday on your last payslip: ${hol}h`));
  }
  const box = $('mnWatches');
  box.textContent = '';
  const ws = S.priceWatches ?? [];
  if (!ws.length) return;
  box.appendChild(el('div', 'muted', 'Watching prices'));
  for (const w of ws) {
    const d = el('div', 'li');
    const a = el('a', undefined, w.name) as HTMLAnchorElement;
    a.href = w.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const t = el('span');
    t.style.flex = '1';
    t.append(
      a,
      el('small', 'muted', ` ${w.price != null ? money(w.price) : 'price not found yet'}`),
    );
    const x = el('button', 'btn', '×');
    x.setAttribute('aria-label', `Stop watching ${w.name}`);
    x.onclick = () => {
      S.priceWatches = (S.priceWatches ?? []).filter((v) => v.id !== w.id);
      save();
      renderMoney();
    };
    d.append(t, x);
    box.appendChild(d);
  }
}

/** The price on a product page (fetched by the app, so shops' cross-site rules don't apply). */
async function fetchPrice(url: string): Promise<number | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const r = isApp
      ? await CapacitorHttp.request({
          url,
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Mobile', Accept: 'text/html' },
          connectTimeout: 15_000,
          readTimeout: 15_000,
        })
      : { status: 0, data: '' };
    if (r.status < 200 || r.status >= 400 || typeof r.data !== 'string') return null;
    return extractPrice(r.data);
  } catch {
    return null;
  }
}
let pricesBusy = false;
async function checkPrices(force = false): Promise<void> {
  const ws = S.priceWatches ?? [];
  if (pricesBusy || !ws.length || !isApp) return;
  pricesBusy = true;
  try {
    for (const w of ws) {
      if (!force && Date.now() - w.checked < 20 * 3_600_000) continue;
      const now = await fetchPrice(w.url);
      w.checked = Date.now();
      if (now === null) continue;
      const drop = priceDrop(w, now);
      if (drop) void notifyNow(7000 + (hashCode(w.id) % 900), drop.title, drop.body);
      w.price = now;
      w.lowest = w.lowest === null ? now : Math.min(w.lowest, now);
    }
    save();
    renderMoney();
  } finally {
    pricesBusy = false;
  }
}
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

async function moneyTool(
  name: string,
  input: unknown,
): Promise<{ result: string; actions?: PhoneAction[] } | null> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  if (name === 'save_payslip') {
    const slip = cleanPayslip(o);
    if (!slip)
      return { result: 'Couldn’t read the pay figures: ask the user for a clearer photo.' };
    const c = comparePayslip(slip, S.shifts, {
      rate: S.payRate,
      unpaidBreak: S.unpaidBreak,
      breakOver: S.breakAll ? 0 : 6,
    });
    S.payslips = [
      ...(S.payslips ?? []).filter(
        (p) => !(p.periodStart === slip.periodStart && p.periodEnd === slip.periodEnd),
      ),
      slip,
    ]
      .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
      .slice(-12);
    save();
    renderMoney();
    renderPayCard();
    const rate = takeHomeRate(S.payslips);
    return {
      result: [
        `Saved the payslip for ${slip.periodStart} to ${slip.periodEnd}.`,
        c.rotaHours === null
          ? 'No shifts are saved for that period, so hours could not be checked against the rota.'
          : `Rota hours for that period: ${c.rotaHours}h.`,
        c.issues.length
          ? `Differences:\n- ${c.issues.join('\n- ')}`
          : 'It matches the rota and pay rate.',
        c.ask ? `Suggested message for the manager: "${c.ask}"` : '',
        slip.holidayHours != null ? `Holiday listed: ${slip.holidayHours}h.` : '',
        rate
          ? `Payday estimates now use ${Math.round(rate * 100)}% take-home from real payslips.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      actions: c.ask
        ? [{ label: 'Copy message for my manager', sub: c.ask.slice(0, 60), copy: c.ask }]
        : [],
    };
  }
  if (name === 'make_listing') {
    const site = o.site === 'ebay' ? 'ebay' : 'vinted';
    const str = (v: unknown, n: number): string =>
      typeof v === 'string' ? v.trim().slice(0, n) : '';
    const title = str(o.title, site === 'ebay' ? 80 : 100);
    const desc = str(o.description, 3000);
    const price = typeof o.price === 'number' && o.price > 0 ? Math.round(o.price * 100) / 100 : 0;
    const extra = [
      str(o.condition, 60) && `Condition: ${str(o.condition, 60)}`,
      str(o.brand, 60) && `Brand: ${str(o.brand, 60)}`,
      str(o.size, 40) && `Size: ${str(o.size, 40)}`,
    ].filter(Boolean) as string[];
    const actions: PhoneAction[] = [
      { label: 'Copy title', sub: title.slice(0, 60), copy: title },
      { label: 'Copy description', sub: desc.slice(0, 60), copy: desc },
      ...(price
        ? [
            {
              label: `Copy price £${price.toFixed(2)}`,
              sub: str(o.priceNote, 80),
              copy: price.toFixed(2),
            },
          ]
        : []),
      ...extra.map((x) => ({
        label: `Copy ${x.split(':')[0]?.toLowerCase() ?? ''}`,
        sub: x,
        copy: x.split(': ')[1] ?? x,
      })),
      site === 'ebay'
        ? { label: 'Open eBay to post it', href: 'https://www.ebay.co.uk/sl/sell' }
        : { label: 'Open Vinted to post it', href: 'https://www.vinted.co.uk/items/new' },
    ];
    return {
      result: `Listing card shown with Copy buttons and an Open ${site === 'ebay' ? 'eBay' : 'Vinted'} button. Tell them to add the photos in the app, paste each part, and check the details are right before posting.`,
      actions,
    };
  }
  if (name === 'spending_check') {
    if (!isApp || !S.spendApps.length)
      return {
        result:
          'Bank notifications aren’t set up on this phone (Settings › Phone › Spending). Ask the user for a statement screenshot or PDF instead, and check that.',
      };
    const list = await payments();
    const now = new Date();
    const c = spendingCheck(list, new Date(now.getFullYear(), now.getMonth(), 1).getTime());
    return {
      result: [
        c.recurring.length
          ? `Repeat payments: ${c.recurring.map((r) => `${r.merchant} ${gbp(r.amount)} a ${r.every}`).join(', ')}`
          : 'No repeat payments spotted yet (it needs a couple of months of notifications).',
        c.categories.length
          ? `This month by category: ${c.categories
              .slice(0, 6)
              .map((x) => `${x.name} ${gbp(x.total)}`)
              .join(', ')}`
          : 'No spending seen this month.',
        c.suggestions.length ? `Suggestions:\n- ${c.suggestions.join('\n- ')}` : '',
        '(From bank notifications on this phone; anything without a notification is missing.)',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }
  if (name === 'watch_price') {
    const act = o.action === 'list' || o.action === 'remove' ? o.action : 'add';
    const ws = S.priceWatches ?? [];
    if (act === 'list')
      return {
        result: ws.length
          ? ws
              .map(
                (w) =>
                  `${w.name}: ${w.price != null ? gbp(w.price) : 'price not found'}${w.lowest != null ? ` (lowest ${gbp(w.lowest)})` : ''}`,
              )
              .join('\n')
          : 'Nothing is being watched.',
      };
    const nm = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    if (act === 'remove') {
      const lc = nm.toLowerCase();
      const left = ws.filter((w) => !w.name.toLowerCase().includes(lc));
      S.priceWatches = left;
      save();
      renderMoney();
      return { result: `Stopped watching ${ws.length - left.length} item(s).` };
    }
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!/^https:\/\/\S+$/i.test(url))
      return { result: 'Need the product page link (https). Find it with web_search first.' };
    if (ws.length >= 20) return { result: 'Already watching 20 prices: remove one first.' };
    const price = await fetchPrice(url);
    const w: PriceWatch = {
      id: `w${Date.now().toString(36)}`,
      name: nm || new URL(url).hostname,
      url,
      price,
      lowest: price,
      checked: Date.now(),
      added: Date.now(),
    };
    S.priceWatches = [...ws.filter((x) => x.url !== url), w];
    save();
    renderMoney();
    return {
      result:
        price !== null
          ? `Watching ${w.name}: ${gbp(price)} now. Alton checks it about once a day and sends a notification if it drops.`
          : `Watching ${w.name}, but the page didn't show a price Alton can read${isApp ? '' : ' (price checks work in the Android app)'}. It will keep trying daily; a different shop's page may work better.`,
    };
  }
  return null;
}
