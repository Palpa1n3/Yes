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
}

export type StreamChunk =
  | { type: 'text'; responseId: string; delta: string }
  /** `toolUseId` is set when a real model asked for the action and is waiting for its result. */
  | { type: 'intent'; responseId: string; intent: RawIntent; toolUseId?: string }
  /** Informational line for the transcript (e.g. "offline, using the mock"). */
  | { type: 'notice'; responseId: string; message: string }
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

export type ThemeId = 'arc-cyan' | 'solar-gold' | 'crimson' | 'mono';

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
  sfx: boolean;
  sfxVolume: number; // 0–1
  wakeWord: boolean; // placeholder, not implemented yet
  /* Hotkeys */
  /** Electron accelerator, e.g. "CommandOrControl+Space". */
  globalHotkey: string;
  /* Advanced */
  /** 'anthropic' needs an API key (stored encrypted in main, never in settings). */
  provider: AiProvider;
  model: AiModel;
}

export type AiProvider = 'mock' | 'anthropic';
export const AI_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const;
export type AiModel = (typeof AI_MODELS)[number];

export const DEFAULT_SETTINGS: Settings = {
  assistantName: 'ARC',
  userName: '',
  closeToTray: true,
  launchAtLogin: false,
  persistHistory: true,
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
  sfx: true,
  sfxVolume: 0.35,
  wakeWord: false,
  globalHotkey: 'CommandOrControl+Space',
  provider: 'mock',
  model: 'claude-haiku-5-5',
};

export interface WindowStatePayload {
  maximized: boolean;
  compact: boolean;
}

/** Main → renderer requests (tray menu, global hotkey). */
export type AppCommand =
  { type: 'focus-input' } | { type: 'open-settings' } | { type: 'notice'; text: string };

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
  | { id: string; role: 'user'; text: string; timestamp: number }
  | {
      id: string;
      role: 'assistant';
      text: string;
      timestamp: number;
      streaming: boolean;
      revealed: boolean;
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
