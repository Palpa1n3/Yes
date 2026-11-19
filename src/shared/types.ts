import { DEFAULT_PROMPTS } from './prompts';
import { DEFAULT_FISH_VOICE, type FishModel, type VoiceEngine, type WhisperModel } from './voice';
import type { TempUnit, WeatherPlace, WindUnit } from './weather';
import { DEFAULT_PERSONALITY, type Personality } from './personalities';

/** Shared domain types used by main, preload and renderer. No runtime code. */

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing' | 'error';

export interface DiskStats {
  id: string;
  mount: string; // "C:" or "/"
  label: string;
  /** 'local' = fixed disk whose media type isn't known. */
  kind: 'nvme' | 'ssd' | 'hdd' | 'usb' | 'network' | 'local';
  size: number; // bytes
  used: number; // bytes
}

export interface ProcessStats {
  pid: number;
  name: string;
  cpu: number; // % of the whole machine
  mem: number; // bytes
  /** How many processes were grouped under this name (Windows groups by app). */
  count?: number;
}

export interface SystemStats {
  cpu: { load: number; cores: number[]; speedGHz: number; temp: number | null };
  memory: { used: number; total: number; swapUsed: number; swapTotal: number };
  /** null fields = the driver doesn't report them (e.g. load on many non-NVIDIA GPUs). */
  gpu: {
    name: string;
    load: number | null;
    memUsed: number | null;
    memTotal: number | null;
    temp: number | null;
  } | null;
  network: {
    up: number; // bytes/s
    down: number; // bytes/s
    iface: string;
    type: 'wired' | 'wireless' | 'unknown';
    ssid: string | null;
    latencyMs: number | null;
    /** Bytes through the default interface since boot. */
    rxTotal: number;
    txTotal: number;
  };
  disks: DiskStats[];
  processes: ProcessStats[]; // top N by CPU
  battery: { percent: number; charging: boolean } | null; // null = desktop, no battery
  uptime: number; // seconds
  timestamp: number; // epoch ms
}

/** Static machine facts, read once. */
export interface SystemInfo {
  hostname: string;
  username: string;
  platform: string; // process.platform
  osName: string; // "Windows 11", "macOS", "Linux"
  osRelease: string;
  arch: string;
  cpuModel: string;
  cpuThreads: number;
  memTotal: number;
}

export interface UserMessage {
  id: string;
  text: string;
  timestamp: number;
  /** Which saved chat this belongs to. */
  chatId?: string;
  /** Files and pictures sent with the message. */
  attachments?: import('./attachments').Attachment[];
}

export interface AssistantResponse {
  id: string;
  text: string;
  timestamp: number;
}

/** A raw intent exactly as the AI produced it; canonIntent() normalises the action. */
export interface RawIntent {
  action: string;
  target?: string;
  /** Extra parameters (e.g. a timer label, "mute"). */
  args?: string[];
}

export type StreamChunk =
  | { type: 'text'; responseId: string; delta: string }
  /** `toolUseId` is set when a real model asked for the action and is waiting for its result. */
  | { type: 'intent'; responseId: string; intent: RawIntent; toolUseId?: string }
  /** Informational line for the transcript (e.g. "offline, using the mock"). */
  | { type: 'notice'; responseId: string; message: string }
  /** What the model is doing right now ("Searching the web…"). */
  | { type: 'activity'; responseId: string; text: string }
  /** Web pages the answer used, shown under the reply. */
  | { type: 'sources'; responseId: string; sources: import('./chats').Source[] }
  | { type: 'done'; responseId: string }
  | { type: 'error'; responseId: string; message: string };

/** What a provider yields; the IPC layer stamps the responseId. */
export type ProviderChunk = StreamChunk extends infer C
  ? C extends StreamChunk
    ? Omit<C, 'responseId'>
    : never
  : never;

/** Response ids are derived from the user message id, so the renderer can match
 *  stream chunks to the message before the send() promise resolves. */
export const responseIdFor = (userMessageId: string): string => `r-${userMessageId}`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export type ThemeId = 'arc-cyan' | 'solar-gold' | 'crimson' | 'sentinel' | 'violet' | 'mono';

export type ReduceMotion = 'system' | 'on' | 'off';

export interface Settings {
  /* General */
  assistantName: string;
  /** Your first name, used by personalities that address you by name. */
  userName: string;
  closeToTray: boolean;
  launchAtLogin: boolean;
  /** Keep the conversation between restarts (stored locally in userData). */
  persistHistory: boolean;
  /** Town for the weather panel (only its coordinates are sent to the weather service). */
  weatherPlace: WeatherPlace | null;
  tempUnit: TempUnit;
  windUnit: WindUnit;
  /** Heads-up this many minutes before timed calendar events (0 = off). */
  calendarReminder: number;
  /* Personality */
  personality: Personality;
  /* Appearance */
  theme: ThemeId;
  scanlines: boolean;
  particles: boolean;
  reduceMotion: ReduceMotion;
  alwaysOnTop: boolean;
  bootSequence: boolean;
  /* Voice & sound */
  voiceMuted: boolean;
  /** Read replies aloud with the system voice. */
  speakReplies: boolean;
  voiceName: string; // '' = system default
  /** Who speaks: the Windows voices, or Fish Audio (needs an API key in main). */
  voiceEngine: VoiceEngine;
  fishVoiceId: string;
  fishModel: FishModel;
  /** The mic button (local Whisper speech-to-text). */
  voiceInput: boolean;
  whisperModel: WhisperModel;
  /** How you speak (e.g. "Welsh"), so Alton allows for speech-recognition slips. */
  accent: string;
  sfx: boolean;
  sfxVolume: number; // 0–1
  wakeWord: boolean; // placeholder, not implemented yet
  /** Play an alarm when a timer ends (separate from the quiet effects). */
  alarmSound: boolean;
  alarmVolume: number; // 0–1
  /* Hotkeys */
  /** Electron accelerator, e.g. "CommandOrControl+Space". */
  globalHotkey: string;
  /** Start/stop talking from any app; '' = off. */
  voiceHotkey: string;
  /** Turn "open mic" (everything you say goes to ARC, no name needed) on/off; '' = off. */
  openMicHotkey: string;
  /** Open mic switches itself off after this many quiet minutes. */
  openMicMinutes: number;
  /** Screen awareness: keep a picture of the screen for Claude to look at when asked. */
  screenAware: boolean;
  /** Remember recent copied text (memory only, cleared on quit). */
  clipboardHistory: boolean;
  /** Heads-up about heat, full drives, low memory, long uptime. */
  healthAlerts: boolean;
  /* Gaming mode */
  /** Spot running games and switch gaming mode on/off automatically. */
  gamingMode: boolean;
  gamingPowerPlan: boolean;
  /** No speech, sounds or wake word while gaming. */
  gamingQuiet: boolean;
  /** Apps to close (politely) while gaming, reopened afterwards. */
  gamingCloseApps: string[];
  /** Extra game process names to recognise. */
  gamingGames: string[];
  /* Advanced */
  /** 'anthropic' needs an API key (stored encrypted in main, never in settings). */
  provider: AiProvider;
  model: AiModel;
  /** Model for chats in research mode (web search, fuller answers). */
  researchModel: AiModel;
  /** Agent Mode ("handle this for me"): Alton uses the mouse and keyboard. */
  agentMode: boolean;
  agentModel: AiModel;
  /** Notice and remember useful facts from chats automatically (shown in Notes › Memory). */
  autoMemory: boolean;
  /** Offer help unprompted (suggestions), outside quiet hours. */
  initiative: boolean;
  /** Quiet hours for suggestions: from this hour (0-23) until quietEnd. Equal = never quiet. */
  quietStart: number;
  quietEnd: number;
  /** Offline AI: an Ollama model name (e.g. "llama3.2"); '' = the simple built-in replies. */
  localModel: string;
  /** Extra wake words besides the assistant's name (e.g. "Jarvis", "Computer"). */
  wakeWords: string[];
  /** Keep listening for the wake word while gaming (in-game voice help). */
  gamingVoice: boolean;
  /** Back up game saves changed during a gaming session. */
  saveBackups: boolean;
  /** Per-game extras while that game runs. */
  gamingProfiles: Record<string, GameProfile>;
  /** What Alton may do: ask first, just do it, or never. */
  permissions: Record<PermissionKey, Permission>;
  /** Overview panels the user has hidden. */
  hiddenPanels: string[];
  /** The first-run setup guide has been completed (or skipped). */
  onboarded: boolean;
  /** Your own slash commands (/fix, /summarize...); {text} = what follows or the clipboard. */
  prompts: import('./prompts').SavedPrompt[];
  /** Show the saved prompts for what you just copied, from any app; '' = off. */
  clipboardHotkey: string;
  /** Home address (or postcode) for journey times; '' = the weather town. */
  homeAddress: string;
  /** "Leave by" heads-ups for calendar events with a location. */
  leaveReminders: boolean;
  /** Saver mode: cheapest model for chat and research, fewer web searches, no background
   *  memory learning. Agent Mode keeps its own model. */
  saver: boolean;
  /** Monthly Claude spending limit in US dollars for warnings (0 = no limit). */
  monthlyBudget: number;
  /** Where the phone-only app lives (GitHub Pages). */
  phoneAppUrl: string;
  /** Phone companion: serve a web app on the home network (pair with a code). */
  phoneAccess: boolean;
  /** Whisper mode: quieter, slower speech and no sound effects. */
  whisper: boolean;
  /** After answering a spoken request, keep listening a few seconds for a follow-up (no name needed). */
  followUp: boolean;
  /** The centre of the HUD: an animated face, or the rings. */
  avatar: AvatarStyle;
  /** ARC's project folder, read-only, so Claude can read its own code ('' = not set). */
  sourceDir: string;
}

export type AvatarStyle = 'face' | 'rings' | 'code' | 'sphere' | 'cloud';

export type AiProvider = 'mock' | 'anthropic';

export const PERMISSION_KEYS = [
  'launch_app',
  'close_app',
  'open_url',
  'lock_screen',
  'run_routine',
  'set_volume',
  'media_control',
  'files',
  'message_sellers',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permission = 'allow' | 'ask' | 'block';

export interface GameProfile {
  /** Extra apps to close while this game runs. */
  closeApps: string[];
  /** Use the High performance power plan for this game (else the global setting). */
  highPerformance: boolean;
  /** A note Alton gives Claude about this game (e.g. "competitive, keep quiet"). */
  note?: string;
}
export const AI_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];

export const DEFAULT_SETTINGS: Settings = {
  assistantName: 'ARC',
  userName: '',
  closeToTray: true,
  launchAtLogin: false,
  persistHistory: true,
  weatherPlace: null,
  tempUnit: 'c',
  windUnit: 'kmh',
  calendarReminder: 10,
  personality: DEFAULT_PERSONALITY,
  theme: 'arc-cyan',
  scanlines: false,
  particles: true,
  reduceMotion: 'system',
  alwaysOnTop: false,
  bootSequence: true,
  voiceMuted: false,
  speakReplies: false,
  voiceName: '',
  voiceEngine: 'system',
  fishVoiceId: DEFAULT_FISH_VOICE,
  fishModel: 's2.1-pro-free',
  voiceInput: true,
  whisperModel: 'base',
  accent: '',
  sfx: true,
  sfxVolume: 0.35,
  wakeWord: false,
  alarmSound: true,
  alarmVolume: 0.8,
  globalHotkey: 'CommandOrControl+Space',
  voiceHotkey: 'CommandOrControl+Alt+Space',
  openMicHotkey: 'CommandOrControl+Alt+M',
  openMicMinutes: 5,
  screenAware: true,
  clipboardHistory: true,
  healthAlerts: true,
  gamingMode: false,
  gamingPowerPlan: true,
  gamingQuiet: true,
  gamingCloseApps: [],
  gamingGames: [],
  provider: 'mock',
  model: 'claude-haiku-5-5',
  researchModel: 'claude-sonnet-5-5',
  agentMode: true,
  agentModel: 'claude-sonnet-5-5',
  autoMemory: true,
  initiative: true,
  quietStart: 22,
  quietEnd: 8,
  avatar: 'face',
  sourceDir: '',
  whisper: false,
  followUp: true,
  localModel: '',
  phoneAccess: false,
  phoneAppUrl: 'https://palpa1n3.github.io/Yes/',
  monthlyBudget: 0,
  homeAddress: '',
  leaveReminders: true,
  saver: false,
  onboarded: false,
  prompts: DEFAULT_PROMPTS.map((p) => ({ ...p })),
  clipboardHotkey: 'CommandOrControl+Alt+C',
  wakeWords: [],
  gamingVoice: false,
  saveBackups: true,
  gamingProfiles: {},
  permissions: {
    launch_app: 'allow',
    close_app: 'ask',
    open_url: 'allow',
    lock_screen: 'ask',
    run_routine: 'ask',
    set_volume: 'allow',
    media_control: 'allow',
    files: 'allow',
    // You asked for Alton to talk to sellers; offers and payments always need your OK.
    message_sellers: 'allow',
  },
  hiddenPanels: [],
};

export interface WindowStatePayload {
  maximized: boolean;
  compact: boolean;
}

/** Main → renderer requests (tray menu, global hotkey). */
export type AppCommand =
  | { type: 'focus-input' }
  | { type: 'open-settings' }
  | { type: 'notice'; text: string }
  | { type: 'voice-toggle' }
  | { type: 'open-mic-toggle' }
  | { type: 'run-routine'; id: string }
  | { type: 'emergency-stop' }
  | {
      type: 'remote-message';
      id: string;
      text: string;
      chatId?: string;
      images?: Array<{ name: string; data: string; thumb: string }>;
    }
  | { type: 'remote-cancel' }
  | { type: 'clipboard-actions'; text: string };

/** What extra (expensive) telemetry the renderer currently needs. */
export interface TelemetryDetail {
  processes: boolean;
}

/* ── Conversation (shared so main can persist history) ─────────────────── */

export interface CommandInfoShared {
  cmd: import('./commands').CanonicalCommand;
  /** 'awaiting' = waiting for Approve / Cancel. */
  status: 'awaiting' | 'pending' | 'success' | 'failed' | 'cancelled';
  result?: import('./commands').CommandResult;
  /** Set when a real model is waiting on this action's outcome. */
  toolUseId?: string;
  responseId?: string;
}

export type StoredMessage =
  | {
      id: string;
      role: 'user';
      text: string;
      timestamp: number;
      attachments?: import('./attachments').AttachmentInfo[];
    }
  | {
      id: string;
      role: 'assistant';
      text: string;
      timestamp: number;
      streaming: boolean;
      revealed: boolean;
      sources?: import('./chats').Source[];
      /** Picture cards for the pages/products the answer links to. */
      previews?: import('./preview').LinkPreview[];
    }
  | { id: string; role: 'command'; timestamp: number; command: CommandInfoShared }
  | { id: string; role: 'system'; text: string; timestamp: number; tone: 'info' | 'error' };

/** Facts about the running app for the Settings panel. */
export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  userDataPath: string;
  /** Global shortcut actually registered (may differ from the setting if it was taken). */
  activeHotkey: string | null;
  activeVoiceHotkey: string | null;
  activeOpenMicHotkey: string | null;
  activeClipboardHotkey: string | null;
}

/** One entry in userData/apps.json. */
export interface AppEntry {
  id: string;
  name: string;
  /** Executable path (env vars like %LOCALAPPDATA% allowed) or a bare command on PATH. */
  path?: string;
  args?: string[];
  /** Name as it appears in the Windows Start menu, for automatic lookup. */
  startMenu?: string;
  /** URI fallback, e.g. "spotify:" or "ms-settings:". Only ever taken from this file. */
  uri?: string;
  icon?: string;
  /** Natural phrases that route here, e.g. "play music". */
  intents: string[];
}

/** An app found among installed programs (Windows Start menu). */
export interface InstalledApp {
  name: string;
  appId: string;
}

export const USER_FOLDERS = [
  'documents',
  'downloads',
  'desktop',
  'pictures',
  'videos',
  'music',
] as const;
export type UserFolder = (typeof USER_FOLDERS)[number];

export interface FolderInfo {
  id: UserFolder;
  name: string;
  path: string;
  exists: boolean;
}

/* ── Network & storage details (on demand) ─────────────────────────────── */

export interface NetInterfaceInfo {
  name: string;
  type: 'wired' | 'wireless' | 'virtual';
  ip4: string | null;
  mac: string | null;
  speedMbps: number | null;
  up: boolean;
  isDefault: boolean;
}

export interface NetworkDetails {
  hostname: string;
  gateway: string | null;
  dns: string[];
  interfaces: NetInterfaceInfo[];
  wifi: { ssid: string; signal: number | null } | null;
}

export interface LatencyResult {
  name: string;
  host: string;
  ms: number | null;
}

export interface DownloadItem {
  name: string;
  size: number;
  modified: number;
}

export type ScanFolder = UserFolder | 'temp';

export interface FolderSize {
  id: ScanFolder;
  name: string;
  path: string;
  bytes: number;
  files: number;
  /** False if the scan hit its time limit (bytes is then a lower bound). */
  complete: boolean;
  /** Bytes in files untouched for 90+ days (Downloads/Temp only). */
  oldBytes?: number;
}

/* ── AI provider ───────────────────────────────────────────────────────── */

/** What the renderer reports back to the model after running (or declining) an action. */
export interface ToolOutcome {
  status: 'success' | 'failed' | 'cancelled';
  message: string;
}

export interface AiStatus {
  hasKey: boolean;
  /** False if the OS can't encrypt secrets (then keys can't be saved). */
  encryptionAvailable: boolean;
}

export interface AiTestResult {
  ok: boolean;
  message: string;
}

/* ── Timers ────────────────────────────────────────────────────────────── */

/** One step of a running routine, pushed to the renderer. `say` is text for ARC to show and speak. */
export interface RoutineProgress {
  routineId: string;
  name: string;
  index: number;
  total: number;
  status: 'running' | 'success' | 'failed';
  message: string;
  say?: string;
}

export interface TimerInfo {
  id: string;
  label: string;
  durationMs: number;
  createdAt: number;
  dueAt: number;
  /** 'ringing' until dismissed or snoozed. */
  status: 'running' | 'ringing';
  /** A focus session (suggestions and alerts stay quiet until it ends), or a scheduled
   *  Agent Mode task that starts by itself when the time comes. */
  kind?: 'focus' | 'agent';
  /** For kind 'agent': what Agent Mode should do. */
  task?: string;
}
