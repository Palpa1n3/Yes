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
  ai: {
    status: () => invoke(IPC.ai.status),
    setKey: (k) => invoke(IPC.ai.setKey, k),
    clearKey: () => invoke(IPC.ai.clearKey),
    test: () => invoke(IPC.ai.test),
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
  history: {
    get: () => invoke(IPC.history.get),
    save: (m) => send(IPC.history.save, m),
    clear: () => send(IPC.history.clear),
  },
  app: {
    onCommand: (cb) => subscribe(IPC.app.onCommand, cb),
    getInfo: () => invoke(IPC.app.getInfo),
    openPath: (t) => send(IPC.app.openPath, t),
    resetSettings: () => invoke(IPC.app.resetSettings),
  },
};

contextBridge.exposeInMainWorld('arc', api);
