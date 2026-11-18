/** Single source of truth for renderer <-> main communication.
 *  Both the preload bridge and main handlers import from here. */
import type { CanonicalCommand, CommandResult } from './commands';
import type { WeatherData, WeatherPlace } from './weather';
import type {
  AiStatus,
  AiTestResult,
  ToolOutcome,
  TimerInfo,
  RoutineProgress,
  AppCommand,
  AppEntry,
  AppInfo,
  FolderInfo,
  DownloadItem,
  FolderSize,
  InstalledApp,
  LatencyResult,
  NetworkDetails,
  UserFolder,
  StoredMessage,
  AssistantResponse,
  Settings,
  StreamChunk,
  SystemInfo,
  SystemStats,
  TelemetryDetail,
  UserMessage,
  WindowStatePayload,
} from './types';
import type { Routine } from './routines';
import type { FishKeyResult, VoiceStatus } from './voice';

export const IPC = {
  window: {
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    setAlwaysOnTop: 'window:set-always-on-top',
    setCompact: 'window:set-compact',
    peek: 'window:peek',
    getState: 'window:get-state',
    onState: 'window:state',
  },
  system: {
    getStats: 'system:get-stats',
    getInfo: 'system:get-info',
    setDetail: 'system:set-detail',
    onStats: 'system:stats',
  },
  assistant: {
    send: 'assistant:send',
    cancel: 'assistant:cancel',
    toolResult: 'assistant:tool-result',
    reset: 'assistant:reset',
    onStream: 'assistant:stream',
  },
  commands: {
    execute: 'commands:execute',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    onChange: 'settings:changed',
  },
  apps: {
    list: 'apps:list',
    installed: 'apps:installed',
    save: 'apps:save',
    remove: 'apps:remove',
    folders: 'apps:folders',
    openFolder: 'apps:open-folder',
  },
  weather: {
    get: 'weather:get',
    refresh: 'weather:refresh',
    search: 'weather:search',
    onChange: 'weather:changed',
  },
  voice: {
    status: 'voice:status',
    setFishKey: 'voice:set-fish-key',
    clearFishKey: 'voice:clear-fish-key',
    speak: 'voice:speak',
    transcribe: 'voice:transcribe',
    prepare: 'voice:prepare',
    onStatus: 'voice:status-changed',
  },
  routines: {
    list: 'routines:list',
    save: 'routines:save',
    remove: 'routines:remove',
    stop: 'routines:stop',
    startup: 'routines:startup',
    onChange: 'routines:changed',
    onProgress: 'routines:progress',
  },
  timers: {
    list: 'timers:list',
    add: 'timers:add',
    cancel: 'timers:cancel',
    snooze: 'timers:snooze',
    onChange: 'timers:changed',
    onRing: 'timers:ring',
  },
  ai: {
    status: 'ai:status',
    setKey: 'ai:set-key',
    clearKey: 'ai:clear-key',
    test: 'ai:test',
  },
  network: {
    details: 'network:details',
    latency: 'network:latency',
  },
  storage: {
    downloads: 'storage:downloads',
    scan: 'storage:scan',
    reveal: 'storage:reveal',
    openSpecial: 'storage:open-special',
  },
  history: {
    get: 'history:get',
    save: 'history:save',
    clear: 'history:clear',
  },
  app: {
    onCommand: 'app:command',
    getInfo: 'app:get-info',
    openPath: 'app:open-path',
    resetSettings: 'app:reset-settings',
  },
} as const;

/** Request/response channels (ipcRenderer.invoke <-> ipcMain.handle). */
export interface InvokeMap {
  [IPC.window.getState]: { args: []; result: WindowStatePayload };
  [IPC.system.getStats]: { args: []; result: SystemStats };
  [IPC.system.getInfo]: { args: []; result: SystemInfo };
  [IPC.assistant.send]: { args: [msg: UserMessage]; result: AssistantResponse };
  [IPC.commands.execute]: { args: [cmd: CanonicalCommand]; result: CommandResult };
  [IPC.settings.get]: { args: []; result: Settings };
  [IPC.settings.set]: { args: [patch: Partial<Settings>]; result: undefined };
  [IPC.history.get]: { args: []; result: StoredMessage[] };
  [IPC.ai.status]: { args: []; result: AiStatus };
  [IPC.timers.list]: { args: []; result: TimerInfo[] };
  [IPC.routines.list]: { args: []; result: Routine[] };
  [IPC.voice.status]: { args: []; result: VoiceStatus };
  [IPC.voice.setFishKey]: { args: [key: string]; result: FishKeyResult };
  [IPC.voice.clearFishKey]: { args: []; result: VoiceStatus };
  [IPC.voice.speak]: { args: [text: string]; result: Uint8Array };
  [IPC.voice.transcribe]: { args: [samples: Float32Array]; result: string };
  [IPC.routines.save]: { args: [routine: Routine]; result: Routine[] };
  [IPC.routines.remove]: { args: [id: string]; result: Routine[] };
  [IPC.routines.startup]: { args: []; result: Routine[] };
  [IPC.weather.get]: { args: []; result: WeatherState };
  [IPC.weather.refresh]: { args: []; result: WeatherState };
  [IPC.weather.search]: { args: [query: string]; result: WeatherPlace[] };
  [IPC.timers.add]: { args: [minutes: number, label: string]; result: TimerInfo[] };
  [IPC.ai.setKey]: { args: [key: string]; result: AiTestResult };
  [IPC.ai.clearKey]: { args: []; result: AiStatus };
  [IPC.ai.test]: { args: []; result: AiTestResult };
  [IPC.network.details]: { args: []; result: NetworkDetails };
  [IPC.network.latency]: { args: []; result: LatencyResult[] };
  [IPC.storage.downloads]: { args: []; result: DownloadItem[] };
  [IPC.storage.scan]: { args: []; result: FolderSize[] };
  [IPC.apps.list]: { args: []; result: AppEntry[] };
  [IPC.apps.installed]: { args: []; result: InstalledApp[] };
  [IPC.apps.save]: { args: [entry: AppEntry]; result: AppEntry[] };
  [IPC.apps.remove]: { args: [id: string]; result: AppEntry[] };
  [IPC.apps.folders]: { args: []; result: FolderInfo[] };
  [IPC.app.getInfo]: { args: []; result: AppInfo };
  [IPC.app.resetSettings]: { args: []; result: Settings };
}

/** Fire-and-forget channels (ipcRenderer.send -> ipcMain.on). */
export interface SendMap {
  [IPC.window.minimize]: [];
  [IPC.window.toggleMaximize]: [];
  [IPC.window.close]: [];
  [IPC.window.setAlwaysOnTop]: [value: boolean];
  [IPC.window.setCompact]: [value: boolean];
  [IPC.window.peek]: [];
  [IPC.system.setDetail]: [detail: TelemetryDetail];
  [IPC.history.save]: [messages: StoredMessage[]];
  [IPC.timers.cancel]: [id: string];
  [IPC.routines.stop]: [];
  [IPC.voice.prepare]: [];
  [IPC.timers.snooze]: [id: string, minutes: number];
  [IPC.storage.reveal]: [downloadName: string];
  [IPC.storage.openSpecial]: [target: 'temp' | 'recycleBin'];
  [IPC.apps.openFolder]: [folder: UserFolder];
  [IPC.history.clear]: [];
  [IPC.app.openPath]: [target: OpenTarget];
  [IPC.assistant.cancel]: [];
  [IPC.assistant.toolResult]: [responseId: string, toolUseId: string, outcome: ToolOutcome];
  [IPC.assistant.reset]: [];
}

/** Push channels (webContents.send -> ipcRenderer.on). */
export interface EventMap {
  [IPC.window.onState]: WindowStatePayload;
  [IPC.system.onStats]: SystemStats;
  [IPC.assistant.onStream]: StreamChunk;
  [IPC.settings.onChange]: Settings;
  [IPC.app.onCommand]: AppCommand;
  [IPC.timers.onChange]: TimerInfo[];
  [IPC.weather.onChange]: WeatherState;
  [IPC.timers.onRing]: TimerInfo;
  [IPC.routines.onChange]: Routine[];
  [IPC.routines.onProgress]: RoutineProgress;
  [IPC.voice.onStatus]: VoiceStatus;
}

export type InvokeChannel = keyof InvokeMap;
export type SendChannel = keyof SendMap;
export type EventChannel = keyof EventMap;

export type Unsubscribe = () => void;

/** The API exposed to the renderer as `window.arc`. */
export interface ArcAPI {
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    setAlwaysOnTop(v: boolean): void;
    /** Collapse to (or expand from) the 420×120 always-on-top pill. */
    setCompact(v: boolean): void;
    /** Show ARC if it's hidden, without stealing focus (wake word). */
    peek(): void;
    getState(): Promise<WindowStatePayload>;
    onState(cb: (s: WindowStatePayload) => void): Unsubscribe;
  };
  system: {
    getStats(): Promise<SystemStats>;
    getInfo(): Promise<SystemInfo>;
    /** Turn expensive extras (process list) on only while they're on screen. */
    setDetail(detail: TelemetryDetail): void;
    onStats(cb: (s: SystemStats) => void): Unsubscribe;
  };
  assistant: {
    /** Streams via onStream (responseId = responseIdFor(msg.id)); resolves with the full text. */
    send(msg: UserMessage): Promise<AssistantResponse>;
    /** Stop the in-flight response. */
    cancel(): void;
    /** Report an action's outcome to the model that requested it. */
    toolResult(responseId: string, toolUseId: string, outcome: ToolOutcome): void;
    /** Cancel and forget the conversation history held for the provider. */
    reset(): void;
    onStream(cb: (chunk: StreamChunk) => void): Unsubscribe;
  };
  commands: { execute(cmd: CanonicalCommand): Promise<CommandResult> };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<void>;
    /** Fires when settings change elsewhere (e.g. tray "Mute voice"). */
    onChange(cb: (s: Settings) => void): Unsubscribe;
  };
  apps: {
    /** Entries from apps.json. */
    list(): Promise<AppEntry[]>;
    /** Installed apps (Windows Start menu); [] elsewhere. */
    installed(): Promise<InstalledApp[]>;
    save(entry: AppEntry): Promise<AppEntry[]>;
    remove(id: string): Promise<AppEntry[]>;
    folders(): Promise<FolderInfo[]>;
    openFolder(folder: UserFolder): void;
  };
  weather: {
    get(): Promise<WeatherState>;
    refresh(): Promise<WeatherState>;
    /** Find towns by name (Open-Meteo geocoding). */
    search(query: string): Promise<WeatherPlace[]>;
    onChange(cb: (s: WeatherState) => void): Unsubscribe;
  };
  voice: {
    status(): Promise<VoiceStatus>;
    /** Check a Fish Audio key (by making a one-word clip), then store it encrypted. */
    setFishKey(key: string): Promise<FishKeyResult>;
    clearFishKey(): Promise<VoiceStatus>;
    /** MP3 audio of the text in the chosen Fish Audio voice. */
    speak(text: string): Promise<Uint8Array>;
    /** 16 kHz mono samples → text (local Whisper). */
    transcribe(samples: Float32Array): Promise<string>;
    /** Download/load the speech model ahead of first use. */
    prepare(): void;
    onStatus(cb: (s: VoiceStatus) => void): Unsubscribe;
  };
  routines: {
    list(): Promise<Routine[]>;
    /** Create (unknown id) or update a routine. */
    save(routine: Routine): Promise<Routine[]>;
    remove(id: string): Promise<Routine[]>;
    /** Stop the running routine after its current step. */
    stop(): void;
    /** Routines due to run now that ARC has started (marked as run once started). */
    startup(): Promise<Routine[]>;
    onChange(cb: (list: Routine[]) => void): Unsubscribe;
    onProgress(cb: (p: RoutineProgress) => void): Unsubscribe;
  };
  timers: {
    list(): Promise<TimerInfo[]>;
    add(minutes: number, label: string): Promise<TimerInfo[]>;
    /** Cancel a running timer, or dismiss a ringing one. */
    cancel(id: string): void;
    snooze(id: string, minutes: number): void;
    onChange(cb: (list: TimerInfo[]) => void): Unsubscribe;
    onRing(cb: (timer: TimerInfo) => void): Unsubscribe;
  };
  ai: {
    status(): Promise<AiStatus>;
    /** Validate and store an API key (encrypted by the OS). The key never comes back. */
    setKey(key: string): Promise<AiTestResult>;
    clearKey(): Promise<AiStatus>;
    /** Check the stored key and model without spending credit. */
    test(): Promise<AiTestResult>;
  };
  network: {
    details(): Promise<NetworkDetails>;
    /** Ping router + well-known hosts (slow-ish; call every ~15s at most). */
    latency(): Promise<LatencyResult[]>;
  };
  storage: {
    downloads(): Promise<DownloadItem[]>;
    /** Sizes of your main folders and Temp (time-boxed). */
    scan(): Promise<FolderSize[]>;
    /** Show a file from Downloads in Explorer (by name; never an arbitrary path). */
    reveal(downloadName: string): void;
    openSpecial(target: 'temp' | 'recycleBin'): void;
  };
  history: {
    get(): Promise<StoredMessage[]>;
    save(messages: StoredMessage[]): void;
    clear(): void;
  };
  app: {
    onCommand(cb: (c: AppCommand) => void): Unsubscribe;
    getInfo(): Promise<AppInfo>;
    /** Open one of ARC's own folders/files in Explorer (fixed set, never arbitrary paths). */
    openPath(target: OpenTarget): void;
    resetSettings(): Promise<Settings>;
  };
}

/** Latest weather (null until a town is set or the first fetch) plus any fetch error. */
export interface WeatherState {
  data: WeatherData | null;
  error: string | null;
}

export type OpenTarget = 'userData' | 'appsJson' | 'settingsJson';
