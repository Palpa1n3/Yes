import type { BrowserWindow } from 'electron';
import type { AppCommand, Settings } from '@shared/types';
import type { CompactController } from './compact';
import type { Hotkey } from './hotkey';
import type { SettingsStore } from './services/settings-store';
import type { TelemetryService } from './services/telemetry';
import type { TimerService } from './services/timer-service';

/** Everything main-process modules share. Built once in index.ts. */
export interface MainContext {
  getWindow(): BrowserWindow | null;
  settings: SettingsStore;
  telemetry: TelemetryService;
  timers: TimerService;
  compact: CompactController;
  hotkey: Hotkey;
  voiceHotkey: Hotkey;
  updateSettings(patch: Partial<Settings>): void;
  setCompact(on: boolean): void;
  showWindow(focusInput?: boolean): void;
  /** Show the window if hidden, without taking focus from the app in use. */
  peekWindow(): void;
  toggleWindow(): void;
  openSettings(): void;
  /** Send a request to the renderer (queued until it has loaded). */
  command(c: AppCommand): void;
  pushWindowState(): void;
  quit(): void;
}
