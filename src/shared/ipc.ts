/** Single source of truth for renderer <-> main communication.
 *  Both the preload bridge and main handlers import from here. */
import type { CanonicalCommand, CommandResult } from './commands';
import type {
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

export const IPC = {
  window: {
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    setAlwaysOnTop: 'window:set-always-on-top',
    setCompact: 'window:set-compact',
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
  [IPC.system.setDetail]: [detail: TelemetryDetail];
  [IPC.history.save]: [messages: StoredMessage[]];
  [IPC.storage.reveal]: [downloadName: string];
  [IPC.storage.openSpecial]: [target: 'temp' | 'recycleBin'];
  [IPC.apps.openFolder]: [folder: UserFolder];
  [IPC.history.clear]: [];
  [IPC.app.openPath]: [target: OpenTarget];
  [IPC.assistant.cancel]: [];
  [IPC.assistant.reset]: [];
}

/** Push channels (webContents.send -> ipcRenderer.on). */
export interface EventMap {
  [IPC.window.onState]: WindowStatePayload;
  [IPC.system.onStats]: SystemStats;
  [IPC.assistant.onStream]: StreamChunk;
  [IPC.settings.onChange]: Settings;
  [IPC.app.onCommand]: AppCommand;
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

export type OpenTarget = 'userData' | 'appsJson' | 'settingsJson';
