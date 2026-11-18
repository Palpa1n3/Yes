import { ipcMain, type BrowserWindow } from 'electron';
import type {
  EventChannel,
  EventMap,
  InvokeChannel,
  InvokeMap,
  SendChannel,
  SendMap,
} from '@shared/ipc';

type Awaitable<T> = T | Promise<T>;

/** Typed wrapper around ipcMain.handle: channel name decides args and return type. */
export function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: InvokeMap[C]['args']) => Awaitable<InvokeMap[C]['result']>,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (_event, ...args) => fn(...(args as InvokeMap[C]['args'])));
}

/** Typed wrapper around ipcMain.on for fire-and-forget channels. */
export function on<C extends SendChannel>(
  channel: C,
  fn: (win: BrowserWindow | null, ...args: SendMap[C]) => void,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.removeAllListeners(channel);
  ipcMain.on(channel, (_event, ...args) => fn(getWindow(), ...(args as SendMap[C])));
}

/** Typed push from main to renderer. */
export function emit<C extends EventChannel>(
  win: BrowserWindow | null,
  channel: C,
  payload: EventMap[C],
): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
