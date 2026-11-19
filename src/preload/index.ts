import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type ArcAPI,
  type EventChannel,
  type EventMap,
  type InvokeChannel,
  type InvokeMap,
  type SendChannel,
  type SendMap,
  type Unsubscribe,
} from '@shared/ipc';

const invoke = <C extends InvokeChannel>(
  channel: C,
  ...args: InvokeMap[C]['args']
): Promise<InvokeMap[C]['result']> => ipcRenderer.invoke(channel, ...args);

const send = <C extends SendChannel>(channel: C, ...args: SendMap[C]): void =>
  ipcRenderer.send(channel, ...args);

const subscribe = <C extends EventChannel>(
  channel: C,
  cb: (payload: EventMap[C]) => void,
): Unsubscribe => {
  // Never hand the raw IpcRendererEvent to the renderer.
  const listener = (_e: IpcRendererEvent, payload: EventMap[C]): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const api: ArcAPI = {
  window: {
    minimize: () => send(IPC.window.minimize),
    toggleMaximize: () => send(IPC.window.toggleMaximize),
    close: () => send(IPC.window.close),
    setAlwaysOnTop: (v) => send(IPC.window.setAlwaysOnTop, v),
    setCompact: (v) => send(IPC.window.setCompact, v),
    peek: () => send(IPC.window.peek),
    getState: () => invoke(IPC.window.getState),
    onState: (cb) => subscribe(IPC.window.onState, cb),
  },
  system: {
    getStats: () => invoke(IPC.system.getStats),
    getInfo: () => invoke(IPC.system.getInfo),
    setDetail: (d) => send(IPC.system.setDetail, d),
    onStats: (cb) => subscribe(IPC.system.onStats, cb),
  },
  assistant: {
    send: (msg) => invoke(IPC.assistant.send, msg),
    cancel: () => send(IPC.assistant.cancel),
    toolResult: (r, t, o) => send(IPC.assistant.toolResult, r, t, o),
    reset: () => send(IPC.assistant.reset),
    rewind: (id) => send(IPC.assistant.rewind, id),
    onStream: (cb) => subscribe(IPC.assistant.onStream, cb),
  },
  commands: {
    execute: (cmd) => invoke(IPC.commands.execute, cmd),
  },
  settings: {
    get: () => invoke(IPC.settings.get),
    set: (patch) => invoke(IPC.settings.set, patch),
    onChange: (cb) => subscribe(IPC.settings.onChange, cb),
  },
  apps: {
    list: () => invoke(IPC.apps.list),
    installed: () => invoke(IPC.apps.installed),
    save: (e) => invoke(IPC.apps.save, e),
    remove: (id) => invoke(IPC.apps.remove, id),
    folders: () => invoke(IPC.apps.folders),
    openFolder: (f) => send(IPC.apps.openFolder, f),
  },
  weather: {
    get: () => invoke(IPC.weather.get),
    refresh: () => invoke(IPC.weather.refresh),
    search: (q) => invoke(IPC.weather.search, q),
    onChange: (cb) => subscribe(IPC.weather.onChange, cb),
  },
  previews: {
    get: (urls) => invoke(IPC.previews.get, urls),
  },
  updates: {
    state: () => invoke(IPC.updates.state),
    check: () => invoke(IPC.updates.check),
    install: () => invoke(IPC.updates.install),
    onChange: (cb) => subscribe(IPC.updates.onChange, cb),
  },
  email: {
    state: () => invoke(IPC.email.state),
    refresh: () => invoke(IPC.email.refresh),
    connect: (u, p) => invoke(IPC.email.connect, u, p),
    disconnect: () => invoke(IPC.email.disconnect),
    onChange: (cb) => subscribe(IPC.email.onChange, cb),
  },
  clipboard: {
    list: () => invoke(IPC.clipboard.list),
    read: () => invoke(IPC.clipboard.read),
    copy: (id) => invoke(IPC.clipboard.copy, id),
    remove: (id) => invoke(IPC.clipboard.remove, id),
    clear: () => invoke(IPC.clipboard.clear),
    onChange: (cb) => subscribe(IPC.clipboard.onChange, cb),
    onHealth: (cb) => subscribe(IPC.clipboard.onHealth, cb),
  },
  discord: {
    status: () => invoke(IPC.discord.status),
    set: (u) => invoke(IPC.discord.set, u),
    clear: () => invoke(IPC.discord.clear),
  },
  approval: {
    answer: (id, ok) => send(IPC.approval.answer, id, ok),
    onRequest: (cb) => subscribe(IPC.approval.onRequest, cb),
    onResolved: (cb) => subscribe(IPC.approval.onResolved, cb),
  },
  remote: {
    status: () => invoke(IPC.remote.status),
    newCode: () => invoke(IPC.remote.newCode),
    forget: () => invoke(IPC.remote.forget),
    reply: (id, text) => send(IPC.remote.reply, id, text),
    progress: (id, p) => send(IPC.remote.progress, id, p),
  },
  initiative: {
    onSuggest: (cb) => subscribe(IPC.initiative.onSuggest, cb),
  },
  agent: {
    status: () => invoke(IPC.agent.status),
    start: (t) => invoke(IPC.agent.start, t),
    stop: () => send(IPC.agent.stop),
    pause: (on) => send(IPC.agent.pause, on),
    answer: (id, a) => send(IPC.agent.answer, id, a),
    onChange: (cb) => subscribe(IPC.agent.onChange, cb),
  },
  gaming: {
    status: () => invoke(IPC.gaming.status),
    start: () => invoke(IPC.gaming.start),
    stop: () => invoke(IPC.gaming.stop),
    onChange: (cb) => subscribe(IPC.gaming.onChange, cb),
    download: (on, then) => invoke(IPC.gaming.download, on, then),
    downloadStatus: () => invoke(IPC.gaming.downloadStatus),
    onDownload: (cb) => subscribe(IPC.gaming.onDownload, cb),
  },
  cleanup: {
    scan: () => invoke(IPC.cleanup.scan),
    run: (ids, names) => invoke(IPC.cleanup.run, ids, names),
    openWindowsTool: () => send(IPC.cleanup.openWindowsTool),
  },
  media: {
    get: () => invoke(IPC.media.get),
    onChange: (cb) => subscribe(IPC.media.onChange, cb),
  },
  notes: {
    state: () => invoke(IPC.notes.state),
    apply: (o) => invoke(IPC.notes.apply, o),
    shifts: () => invoke(IPC.notes.shifts),
    onChange: (cb) => subscribe(IPC.notes.onChange, cb),
  },
  calendar: {
    get: () => invoke(IPC.calendar.get),
    refresh: () => invoke(IPC.calendar.refresh),
    setUrl: (u) => invoke(IPC.calendar.setUrl, u),
    clearUrl: () => invoke(IPC.calendar.clearUrl),
    onChange: (cb) => subscribe(IPC.calendar.onChange, cb),
    onReminder: (cb) => subscribe(IPC.calendar.onReminder, cb),
  },
  tasks: {
    list: () => invoke(IPC.tasks.list),
    end: (n, f) => invoke(IPC.tasks.end, n, f),
  },
  voice: {
    status: () => invoke(IPC.voice.status),
    setFishKey: (k) => invoke(IPC.voice.setFishKey, k),
    clearFishKey: () => invoke(IPC.voice.clearFishKey),
    speak: (t) => invoke(IPC.voice.speak, t),
    transcribe: (s) => invoke(IPC.voice.transcribe, s),
    prepare: () => send(IPC.voice.prepare),
    onStatus: (cb) => subscribe(IPC.voice.onStatus, cb),
  },
  routines: {
    list: () => invoke(IPC.routines.list),
    save: (r) => invoke(IPC.routines.save, r),
    remove: (id) => invoke(IPC.routines.remove, id),
    stop: () => send(IPC.routines.stop),
    startup: () => invoke(IPC.routines.startup),
    onChange: (cb) => subscribe(IPC.routines.onChange, cb),
    onProgress: (cb) => subscribe(IPC.routines.onProgress, cb),
  },
  timers: {
    list: () => invoke(IPC.timers.list),
    add: (m, l, k) => invoke(IPC.timers.add, m, l, k),
    cancel: (id) => send(IPC.timers.cancel, id),
    snooze: (id, m) => send(IPC.timers.snooze, id, m),
    onChange: (cb) => subscribe(IPC.timers.onChange, cb),
    onRing: (cb) => subscribe(IPC.timers.onRing, cb),
  },
  ai: {
    status: () => invoke(IPC.ai.status),
    setKey: (k) => invoke(IPC.ai.setKey, k),
    clearKey: () => invoke(IPC.ai.clearKey),
    test: () => invoke(IPC.ai.test),
    localModels: () => invoke(IPC.ai.localModels),
    usage: () => invoke(IPC.ai.usage),
  },
  network: {
    details: () => invoke(IPC.network.details),
    latency: () => invoke(IPC.network.latency),
  },
  storage: {
    downloads: () => invoke(IPC.storage.downloads),
    scan: () => invoke(IPC.storage.scan),
    reveal: (n) => send(IPC.storage.reveal, n),
    openSpecial: (t) => send(IPC.storage.openSpecial, t),
  },
  chats: {
    state: () => invoke(IPC.chats.state),
    open: (id) => invoke(IPC.chats.open, id),
    create: (r) => invoke(IPC.chats.create, r),
    save: (id, m) => send(IPC.chats.save, id, m),
    rename: (id, t) => invoke(IPC.chats.rename, id, t),
    setPinned: (id, p) => invoke(IPC.chats.setPinned, id, p),
    setResearch: (id, r) => invoke(IPC.chats.setResearch, id, r),
    remove: (id) => invoke(IPC.chats.remove, id),
    search: (q) => invoke(IPC.chats.search, q),
    exportMd: (id) => invoke(IPC.chats.exportMd, id),
    onChange: (cb) => subscribe(IPC.chats.onChange, cb),
  },
  app: {
    onCommand: (cb) => subscribe(IPC.app.onCommand, cb),
    getInfo: () => invoke(IPC.app.getInfo),
    openPath: (t) => send(IPC.app.openPath, t),
    openUrl: (u) => send(IPC.app.openUrl, u),
    resetSettings: () => invoke(IPC.app.resetSettings),
    pickSourceDir: () => invoke(IPC.app.pickSourceDir),
    logs: () => invoke(IPC.app.logs),
    history: () => invoke(IPC.app.history),
    clearHistory: () => invoke(IPC.app.clearHistory),
    backups: () => invoke(IPC.app.backups),
    backupNow: () => invoke(IPC.app.backupNow),
    restore: (n) => invoke(IPC.app.restore, n),
    plugins: () => invoke(IPC.app.plugins),
  },
};

contextBridge.exposeInMainWorld('arc', api);
