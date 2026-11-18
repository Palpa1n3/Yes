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
import type { ChatMeta, ChatsState } from './chats';
import type { NotesOp, NotesState } from './notes';
import type { NowPlaying } from './media';
import type { CleanupId, CleanupResult, CleanupScan } from './cleanup';
import type { GamingStatus } from './gaming';
import type { EndTaskResult, TaskList } from './tasks';
import type { CalEvent, CalendarState, CalendarUrlResult } from './calendar';

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
  gaming: {
    status: 'gaming:status',
    start: 'gaming:start',
    stop: 'gaming:stop',
    onChange: 'gaming:changed',
  },
  cleanup: {
    scan: 'cleanup:scan',
    run: 'cleanup:run',
    openWindowsTool: 'cleanup:open-windows-tool',
  },
  media: {
    get: 'media:get',
    onChange: 'media:changed',
  },
  notes: {
    state: 'notes:state',
    apply: 'notes:apply',
    onChange: 'notes:changed',
  },
  calendar: {
    get: 'calendar:get',
    refresh: 'calendar:refresh',
    setUrl: 'calendar:set-url',
    clearUrl: 'calendar:clear-url',
    onChange: 'calendar:changed',
    onReminder: 'calendar:reminder',
  },
  tasks: {
    list: 'tasks:list',
    end: 'tasks:end',
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
  chats: {
    state: 'chats:state',
    open: 'chats:open',
    create: 'chats:create',
    save: 'chats:save',
    rename: 'chats:rename',
    setPinned: 'chats:set-pinned',
    setResearch: 'chats:set-research',
    remove: 'chats:remove',
    search: 'chats:search',
    exportMd: 'chats:export',
    onChange: 'chats:changed',
  },
  app: {
    onCommand: 'app:command',
    openUrl: 'app:open-url',
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
  [IPC.chats.state]: { args: []; result: ChatsState };
  [IPC.chats.open]: { args: [id: string]; result: StoredMessage[] };
  [IPC.chats.create]: { args: [research: boolean]; result: ChatMeta };
  [IPC.chats.rename]: { args: [id: string, title: string]; result: ChatsState };
  [IPC.chats.setPinned]: { args: [id: string, pinned: boolean]; result: ChatsState };
  [IPC.chats.setResearch]: { args: [id: string, research: boolean]; result: ChatsState };
  [IPC.chats.remove]: { args: [id: string]; result: ChatsState };
  [IPC.chats.search]: { args: [query: string]; result: string[] };
  [IPC.chats.exportMd]: { args: [id: string]; result: { ok: boolean; message: string } };
  [IPC.ai.status]: { args: []; result: AiStatus };
  [IPC.timers.list]: { args: []; result: TimerInfo[] };
  [IPC.routines.list]: { args: []; result: Routine[] };
  [IPC.voice.status]: { args: []; result: VoiceStatus };
  [IPC.tasks.list]: { args: []; result: TaskList };
  [IPC.calendar.get]: { args: []; result: CalendarState };
  [IPC.notes.state]: { args: []; result: NotesState };
  [IPC.media.get]: { args: []; result: NowPlaying | null };
  [IPC.cleanup.scan]: { args: []; result: CleanupScan };
  [IPC.gaming.status]: { args: []; result: GamingStatus };
  [IPC.gaming.start]: { args: []; result: GamingStatus };
  [IPC.gaming.stop]: { args: []; result: GamingStatus };
  [IPC.cleanup.run]: { args: [ids: CleanupId[], downloads: string[]]; result: CleanupResult };
  [IPC.notes.apply]: { args: [op: NotesOp]; result: NotesState };
  [IPC.calendar.refresh]: { args: []; result: CalendarState };
  [IPC.calendar.setUrl]: { args: [url: string]; result: CalendarUrlResult };
  [IPC.calendar.clearUrl]: { args: []; result: CalendarState };
  [IPC.tasks.end]: { args: [name: string, force: boolean]; result: EndTaskResult };
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
  [IPC.chats.save]: [id: string, messages: StoredMessage[]];
  [IPC.cleanup.openWindowsTool]: [];
  [IPC.app.openUrl]: [url: string];
  [IPC.timers.cancel]: [id: string];
  [IPC.routines.stop]: [];
  [IPC.voice.prepare]: [];
  [IPC.timers.snooze]: [id: string, minutes: number];
  [IPC.storage.reveal]: [downloadName: string];
  [IPC.storage.openSpecial]: [target: 'temp' | 'recycleBin'];
  [IPC.apps.openFolder]: [folder: UserFolder];
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
  [IPC.chats.onChange]: ChatsState;
  [IPC.calendar.onChange]: CalendarState;
  [IPC.notes.onChange]: NotesState;
  [IPC.media.onChange]: NowPlaying | null;
  [IPC.gaming.onChange]: GamingStatus;
  [IPC.calendar.onReminder]: { event: CalEvent; minutes: number };
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
  gaming: {
    status(): Promise<GamingStatus>;
    /** Turn gaming mode on/off by hand. */
    start(): Promise<GamingStatus>;
    stop(): Promise<GamingStatus>;
    onChange(cb: (s: GamingStatus) => void): Unsubscribe;
  };
  cleanup: {
    /** Size the known-safe places to clear, plus big/old Downloads files. */
    scan(): Promise<CleanupScan>;
    /** Clear the chosen categories; Downloads files go to the Recycle Bin. */
    run(ids: CleanupId[], downloads: string[]): Promise<CleanupResult>;
    /** Windows Disk Cleanup, for system files that need admin rights. */
    openWindowsTool(): void;
  };
  media: {
    /** What's playing (Windows media controls); null when nothing is. */
    get(): Promise<NowPlaying | null>;
    onChange(cb: (n: NowPlaying | null) => void): Unsubscribe;
  };
  notes: {
    state(): Promise<NotesState>;
    apply(op: NotesOp): Promise<NotesState>;
    onChange(cb: (s: NotesState) => void): Unsubscribe;
  };
  calendar: {
    get(): Promise<CalendarState>;
    refresh(): Promise<CalendarState>;
    /** Check a private iCal address (fetch + parse), then store it encrypted. */
    setUrl(url: string): Promise<CalendarUrlResult>;
    clearUrl(): Promise<CalendarState>;
    onChange(cb: (s: CalendarState) => void): Unsubscribe;
    onReminder(cb: (r: { event: CalEvent; minutes: number }) => void): Unsubscribe;
  };
  tasks: {
    /** Every running app/process, grouped by name (tasks is null on the first call). */
    list(): Promise<TaskList>;
    /** End task: a polite close, or (force) taskkill /F after the user confirms. */
    end(name: string, force: boolean): Promise<EndTaskResult>;
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
  chats: {
    state(): Promise<ChatsState>;
    /** Switch to a chat; returns its messages. */
    open(id: string): Promise<StoredMessage[]>;
    create(research: boolean): Promise<ChatMeta>;
    save(id: string, messages: StoredMessage[]): void;
    rename(id: string, title: string): Promise<ChatsState>;
    setPinned(id: string, pinned: boolean): Promise<ChatsState>;
    setResearch(id: string, research: boolean): Promise<ChatsState>;
    remove(id: string): Promise<ChatsState>;
    /** Ids of chats whose title or messages match. */
    search(query: string): Promise<string[]>;
    /** Save a chat as a Markdown file (asks where). */
    exportMd(id: string): Promise<{ ok: boolean; message: string }>;
    onChange(cb: (s: ChatsState) => void): Unsubscribe;
  };
  app: {
    onCommand(cb: (c: AppCommand) => void): Unsubscribe;
    getInfo(): Promise<AppInfo>;
    /** Open one of ARC's own folders/files in Explorer (fixed set, never arbitrary paths). */
    openPath(target: OpenTarget): void;
    /** Open an http(s) link (e.g. a research source) in the default browser. */
    openUrl(url: string): void;
    resetSettings(): Promise<Settings>;
  };
}

/** Latest weather (null until a town is set or the first fetch) plus any fetch error. */
export interface WeatherState {
  data: WeatherData | null;
  error: string | null;
}

export type OpenTarget = 'userData' | 'appsJson' | 'settingsJson';
