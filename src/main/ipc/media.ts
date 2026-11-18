import { app } from 'electron';
import { IPC } from '@shared/ipc';
import type { MainContext } from '../context';
import { MediaWatcher } from '../services/media-watch';
import { emit, handle } from './handle';

export function registerMediaIpc(ctx: MainContext): MediaWatcher {
  const watcher = new MediaWatcher((n) => emit(ctx.getWindow(), IPC.media.onChange, n));
  handle(IPC.media.get, () => watcher.get());
  watcher.start();
  app.on('will-quit', () => watcher.stop());
  return watcher;
}
