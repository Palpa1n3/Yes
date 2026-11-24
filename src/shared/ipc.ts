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
import type { GamingStatus, DownloadStatus } from './gaming';
import type { LinkPreview } from './preview';
import type { ClipItem } from './clipboard';
import type { HealthAlert } from './health';
import type { EmailConnectResult, EmailState } from './email';
import type { UpdateState } from './updates';
import type { AgentStatus } from './agent';
import type { UsageSummary } from './usage';
import type { Suggestion } from './initiative';
import type { ActionRecord } from './audit';
import type { EndTaskResult, TaskList } from './tasks';
import type { CalEvent, CalendarState, CalendarUrlResult } from './calendar';

export const IPC = {
  desk: {
    get: 'desk:get',
    action: 'desk:action',
    hits: 'desk:hits',
    resize: 'desk:resize',
    onSnapshot: 'desk:snapshot',
    displays: 'desk:displays',
    wallpapers: 'desk:wallpapers',
    setWallpaper: 'desk:set-wallpaper',
  },
  mods: {
    status: 'mods:status',
    list: 'mods:list',
    setKey: 'mods:set-key',
    clearKey: 'mods:clear-key',
    openKeyPage: 'mods:key-page',
    check: 'mods:check',
    update: 'mods:update',
    updateAll: 'mods:update-all',
    open: 'mods:open',
    diagnose: 'mods:diagnose',
    cancel: 'mods:cancel',
    loadOrder: 'mods:load-order',
    setOrder: 'mods:set-order',
    resetOrder: 'mods:reset-order',
    fixes: 'mods:fixes',
    autofix: 'mods:autofix',
    undoFix: 'mods:undo-fix',
    setAutoFix: 'mods:set-auto-fix',
    outdated: 'mods:outdated',
    remove: 'mods:remove',
    restore: 'mods:restore',
    recommend: 'mods:recommend',
    hideRec: 'mods:hide-rec',
    install: 'mods:install',
    setShowAdult: 'mods:show-adult',
  },
  minecraft: {
    profiles: 'minecraft:profiles',
    scan: 'minecraft:scan',
    checkUpdates: 'minecraft:check-updates',
    setEnabled: 'minecraft:set-enabled',
    update: 'minecraft:update',
    updateAll: 'minecraft:update-all',
    addMissing: 'minecraft:add-missing',
    fixAll: 'minecraft:fix-all',
    history: 'minecraft:history',
    undo: 'minecraft:undo',
  },
  smarthome: {
    status: 'smarthome:status',
    set: 'smarthome:set',
    clear: 'smarthome:clear',
  },
  discord: {
    status: 'discord:status',
    set: 'discord:set',
    clear: 'discord:clear',
  },
  approval: {
    answer: 'approval:answer',
    onRequest: 'approval:request',
    onResolved: 'approval:resolved',
  },
  remote: {
    status: 'remote:status',
    newCode: 'remote:new-code',
    forget: 'remote:forget',
    reply: 'remote:reply',
    progress: 'remote:progress',
  },
  initiative: {
    onSuggest: 'initiative:suggest',
  },
  agent: {
    status: 'agent:status',
    start: 'agent:start',
    stop: 'agent:stop',
    pause: 'agent:pause',
    answer: 'agent:answer',
    onChange: 'agent:changed',
  },
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
    rewind: 'assistant:rewind',
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
  previews: {
    get: 'previews:get',
  },
  updates: {
    state: 'updates:state',
    check: 'updates:check',
    install: 'updates:install',
    onChange: 'updates:changed',
  },
  email: {
    state: 'email:state',
    refresh: 'email:refresh',
    connect: 'email:connect',
    disconnect: 'email:disconnect',
    onChange: 'email:changed',
  },
  clipboard: {
    list: 'clipboard:list',
    copy: 'clipboard:copy',
    remove: 'clipboard:remove',
    clear: 'clipboard:clear',
    read: 'clipboard:read',
    onChange: 'clipboard:changed',
    onHealth: 'clipboard:health-alert',
  },
  gaming: {
    status: 'gaming:status',
    start: 'gaming:start',
    stop: 'gaming:stop',
    onChange: 'gaming:changed',
    download: 'gaming:download',
    downloadStatus: 'gaming:download-status',
    onDownload: 'gaming:download-changed',
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
    shifts: 'notes:shifts',
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
    localModels: 'ai:local-models',
    usage: 'ai:usage',
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
    reportState: 'app:report-state',
    onCommand: 'app:command',
    openUrl: 'app:open-url',
    getInfo: 'app:get-info',
    openPath: 'app:open-path',
    resetSettings: 'app:reset-settings',
    pickSourceDir: 'app:pick-source-dir',
    logs: 'app:logs',
    history: 'app:history',
    clearHistory: 'app:clear-history',
    backups: 'app:backups',
    backupNow: 'app:backup-now',
    restore: 'app:restore',
    plugins: 'app:plugins',
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
  [IPC.notes.shifts]: { args: []; result: import('./shifts').Shift[] };
  [IPC.media.get]: { args: []; result: NowPlaying | null };
  [IPC.cleanup.scan]: { args: []; result: CleanupScan };
  [IPC.gaming.status]: { args: []; result: GamingStatus };
  [IPC.previews.get]: { args: [urls: string[]]; result: LinkPreview[] };
  [IPC.clipboard.list]: { args: []; result: ClipItem[] };
  [IPC.clipboard.read]: { args: []; result: string };
  [IPC.email.state]: { args: []; result: EmailState };
  [IPC.updates.state]: { args: []; result: UpdateState };
  [IPC.agent.status]: { args: []; result: AgentStatus };
  [IPC.desk.get]: { args: []; result: import('./desk').DeskSnapshot };
  [IPC.desk.displays]: {
    args: [];
    result: Array<{ id: number; label: string; primary: boolean }>;
  };
  [IPC.desk.wallpapers]: { args: []; result: import('./wallpapers').Wallpaper[] };
  [IPC.desk.setWallpaper]: { args: [path: string]; result: { ok: boolean; error?: string } };
  [IPC.mods.status]: { args: []; result: ModsStatus };
  [IPC.mods.diagnose]: { args: []; result: LaunchCheck };
  [IPC.mods.cancel]: { args: []; result: boolean };
  [IPC.mods.loadOrder]: { args: []; result: LoadOrderReport };
  [IPC.mods.setOrder]: {
    args: [change: { kind: 'suggested' } | { kind: 'prefer'; archive: string; over: string }];
    result: { ok: boolean; message: string };
  };
  [IPC.mods.resetOrder]: { args: []; result: { ok: boolean; message: string } };
  [IPC.mods.fixes]: { args: []; result: FixesState };
  [IPC.mods.autofix]: { args: []; result: { message: string; state: FixesState } };
  [IPC.mods.undoFix]: { args: [id: string]; result: { ok: boolean; message: string } };
  [IPC.mods.setAutoFix]: { args: [on: boolean]; result: FixesState };
  [IPC.mods.outdated]: { args: []; result: OutdatedReport };
  [IPC.mods.remove]: { args: [folders: string[]]; result: { ok: boolean; message: string } };
  [IPC.mods.restore]: { args: [folders: string[]]; result: { ok: boolean; message: string } };
  [IPC.mods.recommend]: { args: [fresh?: boolean]; result: RecReport };
  [IPC.mods.hideRec]: { args: [modId: number]; result: boolean };
  [IPC.mods.install]: { args: [modId: number]; result: { ok: boolean; message: string } };
  [IPC.mods.setShowAdult]: { args: [on: boolean]; result: boolean };
  [IPC.mods.list]: { args: []; result: import('./cpmods').CpMod[] };
  [IPC.mods.setKey]: { args: [key: string]; result: { ok: boolean; message: string } };
  [IPC.mods.clearKey]: { args: []; result: boolean };
  [IPC.mods.openKeyPage]: { args: []; result: boolean };
  [IPC.mods.check]: { args: []; result: ModsStatus };
  [IPC.mods.update]: { args: [modId: number]; result: { ok: boolean; message: string } };
  [IPC.mods.updateAll]: { args: []; result: { ok: boolean; message: string } };
  [IPC.mods.open]: {
    args: [what: 'folder' | 'page' | 'game' | 'vortex' | 'removed', modId?: number];
    result: string;
  };
  [IPC.minecraft.profiles]: { args: []; result: McProfile[] };
  [IPC.minecraft.scan]: { args: [profile: string]; result: McReport };
  [IPC.minecraft.checkUpdates]: { args: [profile: string]; result: McReport };
  [IPC.minecraft.setEnabled]: {
    args: [profile: string, file: string, on: boolean];
    result: { ok: boolean; message: string };
  };
  [IPC.minecraft.update]: {
    args: [profile: string, file: string];
    result: { ok: boolean; message: string };
  };
  [IPC.minecraft.updateAll]: { args: [profile: string]; result: { ok: boolean; message: string } };
  [IPC.minecraft.addMissing]: {
    args: [profile: string, modId: string];
    result: { ok: boolean; message: string };
  };
  [IPC.minecraft.fixAll]: { args: [profile: string]; result: { ok: boolean; message: string } };
  [IPC.minecraft.history]: { args: []; result: McChange[] };
  [IPC.minecraft.undo]: { args: [id: string]; result: { ok: boolean; message: string } };
  [IPC.smarthome.status]: { args: []; result: boolean };
  [IPC.smarthome.set]: { args: [token: string]; result: { ok: boolean; message: string } };
  [IPC.smarthome.clear]: { args: []; result: boolean };
  [IPC.discord.status]: { args: []; result: boolean };
  [IPC.discord.set]: { args: [url: string]; result: { ok: boolean; message: string } };
  [IPC.discord.clear]: { args: []; result: boolean };
  [IPC.remote.status]: { args: []; result: RemoteInfo };
  [IPC.remote.newCode]: { args: []; result: RemoteInfo };
  [IPC.remote.forget]: { args: []; result: RemoteInfo };
  [IPC.agent.start]: { args: [task: string]; result: AgentStatus };
  [IPC.updates.check]: { args: []; result: UpdateState };
  [IPC.updates.install]: { args: []; result: boolean };
  [IPC.email.refresh]: { args: []; result: EmailState };
  [IPC.email.connect]: { args: [user: string, appPassword: string]; result: EmailConnectResult };
  [IPC.email.disconnect]: { args: []; result: EmailState };
  [IPC.clipboard.copy]: { args: [id: string]; result: boolean };
  [IPC.clipboard.remove]: { args: [id: string]; result: ClipItem[] };
  [IPC.clipboard.clear]: { args: []; result: ClipItem[] };
  [IPC.gaming.start]: { args: []; result: GamingStatus };
  [IPC.gaming.stop]: { args: []; result: GamingStatus };
  [IPC.gaming.download]: {
    args: [on: boolean, then?: DownloadStatus['then']];
    result: DownloadStatus | { error: string };
  };
  [IPC.gaming.downloadStatus]: { args: []; result: DownloadStatus };
  [IPC.cleanup.run]: { args: [ids: CleanupId[], downloads: string[]]; result: CleanupResult };
  [IPC.notes.apply]: { args: [op: NotesOp]; result: NotesState };
  [IPC.calendar.refresh]: { args: []; result: CalendarState };
  [IPC.calendar.setUrl]: { args: [url: string]; result: CalendarUrlResult };
  [IPC.calendar.clearUrl]: { args: []; result: CalendarState };
  [IPC.tasks.end]: { args: [name: string, force: boolean]; result: EndTaskResult };
  [IPC.voice.setFishKey]: { args: [key: string]; result: FishKeyResult };
  [IPC.voice.clearFishKey]: { args: []; result: VoiceStatus };
  [IPC.voice.speak]: { args: [text: string]; result: Uint8Array };
  [IPC.voice.transcribe]: { args: [samples: Float32Array, raw?: boolean]; result: string };
  [IPC.routines.save]: { args: [routine: Routine]; result: Routine[] };
  [IPC.routines.remove]: { args: [id: string]; result: Routine[] };
  [IPC.routines.startup]: { args: []; result: Routine[] };
  [IPC.weather.get]: { args: []; result: WeatherState };
  [IPC.weather.refresh]: { args: []; result: WeatherState };
  [IPC.weather.search]: { args: [query: string]; result: WeatherPlace[] };
  [IPC.timers.add]: {
    args: [minutes: number, label: string, kind?: 'focus'];
    result: TimerInfo[];
  };
  [IPC.ai.setKey]: { args: [key: string]; result: AiTestResult };
  [IPC.ai.clearKey]: { args: []; result: AiStatus };
  [IPC.ai.test]: { args: []; result: AiTestResult };
  [IPC.ai.localModels]: { args: []; result: string[] | null };
  [IPC.ai.usage]: { args: []; result: UsageSummary };
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
  [IPC.app.pickSourceDir]: { args: []; result: string };
  [IPC.app.logs]: { args: []; result: string[] };
  [IPC.app.history]: { args: []; result: ActionRecord[] };
  [IPC.app.clearHistory]: { args: []; result: ActionRecord[] };
  [IPC.app.backups]: { args: []; result: BackupInfo[] };
  [IPC.app.backupNow]: { args: []; result: BackupInfo[] };
  [IPC.app.restore]: { args: [name: string]; result: boolean };
  [IPC.app.plugins]: { args: []; result: PluginInfo[] };
}

/** Fire-and-forget channels (ipcRenderer.send -> ipcMain.on). */
export interface SendMap {
  [IPC.desk.action]: [action: DeskAction];
  [IPC.desk.hits]: [rects: import('./desk').HitRect[]];
  [IPC.desk.resize]: [height: number];
  [IPC.app.reportState]: [state: string];
  [IPC.window.minimize]: [];
  [IPC.window.toggleMaximize]: [];
  [IPC.window.close]: [];
  [IPC.window.setAlwaysOnTop]: [value: boolean];
  [IPC.window.setCompact]: [value: boolean];
  [IPC.window.peek]: [];
  [IPC.system.setDetail]: [detail: TelemetryDetail];
  [IPC.chats.save]: [id: string, messages: StoredMessage[]];
  [IPC.cleanup.openWindowsTool]: [];
  [IPC.agent.stop]: [];
  [IPC.approval.answer]: [id: string, ok: boolean];
  [IPC.remote.reply]: [id: string, text: string];
  [IPC.remote.progress]: [id: string, progress: RemoteProgress];
  [IPC.agent.pause]: [on: boolean];
  [IPC.agent.answer]: [id: string, answer: string | boolean];
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
  [IPC.assistant.rewind]: [chatId: string];
}

/** Push channels (webContents.send -> ipcRenderer.on). */
export interface EventMap {
  [IPC.desk.onSnapshot]: import('./desk').DeskSnapshot;
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
  [IPC.gaming.onDownload]: DownloadStatus;
  [IPC.clipboard.onChange]: ClipItem[];
  [IPC.email.onChange]: EmailState;
  [IPC.updates.onChange]: UpdateState;
  [IPC.agent.onChange]: AgentStatus;
  [IPC.approval.onRequest]: ApprovalRequest;
  [IPC.approval.onResolved]: string;
  [IPC.initiative.onSuggest]: Suggestion;
  [IPC.clipboard.onHealth]: HealthAlert;
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
    /** The chat's messages were changed (regenerate / edit): rebuild Claude's context from them. */
    rewind(chatId: string): void;
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
  desk: {
    /** What the desktop widget and taskbar strip show (pushed again on every change). */
    get(): Promise<import('./desk').DeskSnapshot>;
    action(a: DeskAction): void;
    /** Where the widget's clickable tiles are; everywhere else, clicks pass through. Main checks
     *  the cursor against these a few times a second (no mouse hook, so the cursor never waits). */
    hits(rects: import('./desk').HitRect[]): void;
    /** The widget's content height, so its window fits. */
    resize(height: number): void;
    onSnapshot(cb: (s: import('./desk').DeskSnapshot) => void): Unsubscribe;
    /** The screens, for choosing where the widget sits. */
    displays(): Promise<Array<{ id: number; label: string; primary: boolean }>>;
    /** Windows desktop wallpapers: the user's previous ones and Windows' own, with previews. */
    wallpapers(): Promise<import('./wallpapers').Wallpaper[]>;
    setWallpaper(path: string): Promise<{ ok: boolean; error?: string }>;
  };
  mods: {
    /** Cyberpunk 2077 mods (Vortex) and updates (Nexus Mods). The API key never comes back. */
    status(): Promise<ModsStatus>;
    list(): Promise<import('./cpmods').CpMod[]>;
    setKey(key: string): Promise<{ ok: boolean; message: string }>;
    clearKey(): Promise<boolean>;
    openKeyPage(): Promise<boolean>;
    /** Ask Nexus which mods have newer versions (the first time: about a minute). */
    check(): Promise<ModsStatus>;
    /** Premium: Vortex downloads and installs it; free: opens the mod's Files page. */
    update(modId: number): Promise<{ ok: boolean; message: string }>;
    updateAll(): Promise<{ ok: boolean; message: string }>;
    open(what: 'folder' | 'page' | 'game' | 'vortex' | 'removed', modId?: number): Promise<string>;
    /** Why won't the game start? (reads its launch logs) */
    diagnose(): Promise<LaunchCheck>;
    /** Stop "Update all" (ones already sent carry on in Vortex). */
    cancel(): Promise<boolean>;
    /** Archive clashes (first loaded wins), suggested moves and the last REDmod deploy. */
    loadOrder(): Promise<LoadOrderReport>;
    /** Writes archive\\pc\\mod\\modlist.txt: the suggested order, or one archive made to win. */
    setOrder(
      change: { kind: 'suggested' } | { kind: 'prefer'; archive: string; over: string },
    ): Promise<{ ok: boolean; message: string }>;
    resetOrder(): Promise<{ ok: boolean; message: string }>;
    /** Launch fixes Alton has made (newest first) and whether it fixes things by itself. */
    fixes(): Promise<FixesState>;
    /** Fix the last launch's problem now (switch off a crashing plugin, redeploy REDmod…). */
    autofix(): Promise<{ message: string; state: FixesState }>;
    undoFix(id: string): Promise<{ ok: boolean; message: string }>;
    setAutoFix(on: boolean): Promise<FixesState>;
    /** Mods with evidence they don't work on this game version, and ones already removed. */
    outdated(): Promise<OutdatedReport>;
    /** Move these Vortex mods' files out of the game folder (kept, so they can be put back). */
    remove(folders: string[]): Promise<{ ok: boolean; message: string }>;
    restore(folders: string[]): Promise<{ ok: boolean; message: string }>;
    /** Recommended mods (Nexus trending / updated / new and your tracked mods, not installed). */
    recommend(fresh?: boolean): Promise<RecReport>;
    /** Not interested: never recommend it again. */
    hideRec(modId: number): Promise<boolean>;
    /** Premium: Vortex downloads and installs it; free: opens its Files page. */
    install(modId: number): Promise<{ ok: boolean; message: string }>;
    setShowAdult(on: boolean): Promise<boolean>;
  };
  minecraft: {
    /** Minecraft profiles with mods (Lunar Client and .minecraft). */
    profiles(): Promise<McProfile[]>;
    /** A profile's mods and problems (wrong version, missing, duplicates, crashes…). */
    scan(profile: string): Promise<McReport>;
    /** The same, plus Modrinth updates for its Minecraft version. */
    checkUpdates(profile: string): Promise<McReport>;
    /** Switch a mod off/on (".jar.disabled"). Refused while Minecraft runs. */
    setEnabled(
      profile: string,
      file: string,
      on: boolean,
    ): Promise<{ ok: boolean; message: string }>;
    update(profile: string, file: string): Promise<{ ok: boolean; message: string }>;
    updateAll(profile: string): Promise<{ ok: boolean; message: string }>;
    /** Add a mod another one needs, from Modrinth. */
    addMissing(profile: string, modId: string): Promise<{ ok: boolean; message: string }>;
    /** Fix what's safe: duplicates off, missing mods added, wrong-version mods updated or off. */
    fixAll(profile: string): Promise<{ ok: boolean; message: string }>;
    history(): Promise<McChange[]>;
    undo(id: string): Promise<{ ok: boolean; message: string }>;
  };
  smarthome: {
    /** Is a SmartThings token saved (the token itself never comes back)? */
    status(): Promise<boolean>;
    /** Checks the token with SmartThings, then stores it encrypted. */
    set(token: string): Promise<{ ok: boolean; message: string }>;
    clear(): Promise<boolean>;
  };
  discord: {
    /** Is a webhook saved (the link itself never comes back)? */
    status(): Promise<boolean>;
    set(url: string): Promise<{ ok: boolean; message: string }>;
    clear(): Promise<boolean>;
  };
  approval: {
    answer(id: string, ok: boolean): void;
    /** Alton asking before a risky step (moving files, posting…). */
    onRequest(cb: (r: ApprovalRequest) => void): Unsubscribe;
    onResolved(cb: (id: string) => void): Unsubscribe;
  };
  remote: {
    /** Phone companion: on/off, its addresses, the pairing code and paired phones. */
    status(): Promise<RemoteInfo>;
    newCode(): Promise<RemoteInfo>;
    /** Unpair every phone. */
    forget(): Promise<RemoteInfo>;
    /** The reply to a message that came from the phone. */
    reply(id: string, text: string): void;
    /** A phone message's reply so far (streams to the phone app). */
    progress(id: string, p: RemoteProgress): void;
  };
  initiative: {
    /** Alton offering help unprompted (see Settings › Smart features). */
    onSuggest(cb: (s: Suggestion) => void): Unsubscribe;
  };
  agent: {
    status(): Promise<AgentStatus>;
    /** Agent Mode: Alton uses the mouse and keyboard to do the task (Esc stops it). */
    start(task: string): Promise<AgentStatus>;
    stop(): void;
    /** Pause after the current step (true) or carry on (false). */
    pause(on: boolean): void;
    /** Answer the agent's question (text) or risky-step check (true = approve). */
    answer(id: string, answer: string | boolean): void;
    onChange(cb: (s: AgentStatus) => void): Unsubscribe;
  };
  updates: {
    state(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    /** Restart now and install the downloaded update. */
    install(): Promise<boolean>;
    onChange(cb: (s: UpdateState) => void): Unsubscribe;
  };
  email: {
    state(): Promise<EmailState>;
    refresh(): Promise<EmailState>;
    /** Check a Gmail address + app password (logs in once), then store them encrypted. */
    connect(user: string, appPassword: string): Promise<EmailConnectResult>;
    disconnect(): Promise<EmailState>;
    onChange(cb: (s: EmailState) => void): Unsubscribe;
  };
  clipboard: {
    /** Recent copied text, newest first (memory only). */
    list(): Promise<ClipItem[]>;
    /** The text on the clipboard now ('' if none). */
    read(): Promise<string>;
    /** Put an earlier copy back on the clipboard. */
    copy(id: string): Promise<boolean>;
    remove(id: string): Promise<ClipItem[]>;
    clear(): Promise<ClipItem[]>;
    onChange(cb: (list: ClipItem[]) => void): Unsubscribe;
    /** PC health heads-ups (heat, full drives…). */
    onHealth(cb: (a: HealthAlert) => void): Unsubscribe;
  };
  previews: {
    /** Picture cards (title, image, site, price) for links in an answer. */
    get(urls: string[]): Promise<LinkPreview[]>;
  };
  gaming: {
    status(): Promise<GamingStatus>;
    /** Turn gaming mode on/off by hand. */
    start(): Promise<GamingStatus>;
    stop(): Promise<GamingStatus>;
    onChange(cb: (s: GamingStatus) => void): Unsubscribe;
    /** Download mode: give Steam the connection (then = what to do when it finishes). */
    download(
      on: boolean,
      then?: DownloadStatus['then'],
    ): Promise<DownloadStatus | { error: string }>;
    downloadStatus(): Promise<DownloadStatus>;
    onDownload(cb: (s: DownloadStatus) => void): Unsubscribe;
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
    /** Upcoming work shifts synced from the phone app. */
    shifts(): Promise<import('./shifts').Shift[]>;
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
    /** raw: exactly what the speech model heard (no learnt fixes), for voice training. */
    transcribe(samples: Float32Array, raw?: boolean): Promise<string>;
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
    /** kind 'focus': a focus session (quiet suggestions and alerts). */
    add(minutes: number, label: string, kind?: 'focus'): Promise<TimerInfo[]>;
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
    /** Models installed in Ollama on this PC; null if Ollama isn't running. */
    localModels(): Promise<string[] | null>;
    /** Estimated Claude spending: today, this month, by feature. */
    usage(): Promise<UsageSummary>;
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
    /** Tell main what Alton is doing (taskbar badge, desktop widget). */
    reportState(state: string): void;
    onCommand(cb: (c: AppCommand) => void): Unsubscribe;
    getInfo(): Promise<AppInfo>;
    /** Open one of ARC's own folders/files in Explorer (fixed set, never arbitrary paths). */
    openPath(target: OpenTarget): void;
    /** Open an http(s) link (e.g. a research source) in the default browser. */
    openUrl(url: string): void;
    resetSettings(): Promise<Settings>;
    /** Choose ARC's project folder (read-only access for self-debugging); '' if cancelled. */
    pickSourceDir(): Promise<string>;
    /** Recent errors and warnings. */
    logs(): Promise<string[]>;
    /** What Alton has done, newest first. */
    history(): Promise<ActionRecord[]>;
    clearHistory(): Promise<ActionRecord[]>;
    /** Daily copies of Alton's data (settings, notes, routines, chats), newest first. */
    backups(): Promise<BackupInfo[]>;
    backupNow(): Promise<BackupInfo[]>;
    /** Put a backup back and restart (current data is backed up first). */
    restore(name: string): Promise<boolean>;
    /** Installed plugins (JSON files in the plugins folder); also adds their routines. */
    plugins(): Promise<PluginInfo[]>;
  };
}

/** Latest weather (null until a town is set or the first fetch) plus any fetch error. */
export interface WeatherState {
  data: WeatherData | null;
  error: string | null;
}

export interface PluginInfo {
  file: string;
  name: string;
  description: string;
  routines: number;
  error: string | null;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  detail: string;
}

export interface RemoteProgress {
  text: string;
  activity: string;
  done: boolean;
  error?: string;
  sources?: import('./chats').Source[];
}

/** Buttons on the desktop widget, taskbar strip, jump list and tray. */
export type DeskAction =
  | 'talk'
  | 'new-chat'
  | 'agent'
  | 'lock'
  | 'sleep'
  | 'widget'
  | 'phone'
  | 'reply'
  | 'play_pause'
  | 'next'
  | 'previous';

export interface RemoteInfo {
  running: boolean;
  /** e.g. http://192.168.1.20:47615 */
  urls: string[];
  code: string;
  paired: number;
  error: string | null;
  /** Network adapters' MAC addresses (for a Wake-on-LAN app). */
  macs: string[];
}

/** A copy of Alton's data in userData/backups. */
export interface BackupInfo {
  name: string;
  at: number;
  size: number;
}

export type OpenTarget =
  'userData' | 'appsJson' | 'settingsJson' | 'logs' | 'backups' | 'saveBackups' | 'plugins';

/** Cyberpunk 2077 mods (Mods tab). */
export interface ModsStatus {
  game: string | null;
  vortex: string | null;
  mods: number;
  files: { archives: number; cet: number; redscript: number; tweaks: number; red4ext: number };
  keySet: boolean;
  account: { name: string; premium: boolean } | null;
  checking: { done: number; total: number } | null;
  lastCheck: number;
  updates: Array<{
    modId: number;
    name: string;
    installed: string;
    latest: string;
    updatedAt: number;
    /** Where its update is up to (null = not started). */
    state: import('./cpmods').UpdateState | null;
    /** Download progress 0–100 while downloading. */
    progress: number | null;
    error: string;
  }>;
  /** "Update all" running in the background. */
  updating: { total: number; done: number; current: string } | null;
  /** Updates sent this session, newest first (installed ones stay for an hour). */
  jobs: Array<{
    modId: number;
    name: string;
    state: import('./cpmods').UpdateState;
    at: number;
    error: string;
  }>;
  dailyLeft: number;
  error: string;
}

/** Mods tab › Won't start?: the launch check plus the Vortex mod behind the culprit plugin. */
export type LaunchCheck = import('./cplaunch').LaunchReport & {
  vortexMod: { name: string; modId: number | null; version: string } | null;
  redmod: import('./cplaunch').RedmodReport | null;
  /** Crashes while playing (crash reports, quest/district, TweakXL rejections). */
  crash: import('./cpcrash').CrashSummary | null;
};

/** Mods tab › Load order. */
export interface LoadOrderReport {
  archives: number;
  /** archive\\pc\\mod\\modlist.txt: none (name order), Alton's, or another tool's. */
  modlist: 'none' | 'alton' | 'other';
  conflicts: Array<
    import('./loadorder').Conflict & { variants: boolean; winnerMod: string; loserMod: string }
  >;
  moves: import('./loadorder').Move[];
  redmod: import('./cplaunch').RedmodReport | null;
  error: string;
}

/** Mods tab › Won't start?: automatic fixes. */
export interface FixesState {
  auto: boolean;
  fixing: boolean;
  fixes: import('./cpfix').FixRecord[];
}

/** Mods tab › Outdated mods. */
export interface OutdatedReport {
  /** Shown above the list when the evidence looks unreliable. */
  warning?: string;
  mods: import('./cpoutdated').OutdatedMod[];
  removed: Array<{ folder: string; name: string; files: number; at: number }>;
  gameVersion: string;
  error: string;
}

/** Mods tab › Recommended. */
export interface RecReport {
  items: Array<import('./cprecommend').Recommendation & { thumb: string }>;
  error: string;
  showAdult: boolean;
}

/** Minecraft tab. */
export interface McProfile {
  id: string;
  name: string;
  launcher: 'Lunar Client' | 'Minecraft Launcher';
  gameVersion: string;
  loader: string;
  modsDir: string;
  mods: number;
  /** The profile Lunar has selected. */
  current: boolean;
}
export interface McUpdate {
  file: string;
  modId: string;
  name: string;
  from: string;
  to: string;
  url: string;
  filename: string;
  sha1: string;
}
export interface McReport {
  profile: McProfile | null;
  mods: import('./mcmods').McMod[];
  problems: import('./mcmods').McProblem[];
  log: string[];
  crash: { at: number; file: string; description: string; suspects: string[] } | null;
  updates: McUpdate[];
  error: string;
}
export interface McChange {
  id: string;
  at: number;
  profile: string;
  kind: 'disable' | 'enable' | 'update' | 'add';
  file: string;
  newFile?: string;
  note: string;
  undone: boolean;
}
