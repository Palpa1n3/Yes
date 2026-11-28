import type { BrowserWindow } from 'electron';
import type { AppCommand, Settings } from '@shared/types';
import type { CompactController } from './compact';
import type { Hotkey } from './hotkey';
import type { SettingsStore } from './services/settings-store';
import type { TelemetryService } from './services/telemetry';
import type { TimerService } from './services/timer-service';
import type { AuditLog, ErrorLog } from './services/diagnostics';
import type { UsageTracker } from './services/usage-tracker';

/** Everything main-process modules share. Built once in index.ts. */
export interface MainContext {
  getWindow(): BrowserWindow | null;
  settings: SettingsStore;
  telemetry: TelemetryService;
  timers: TimerService;
  /** Errors and warnings from main and the UI (for self-debugging). */
  errors: ErrorLog;
  /** What Alton has done (Settings › Privacy › Action history). */
  audit: AuditLog;
  /** Claude spending (Settings › AI › Spending). */
  usage: UsageTracker;
  /** The phone link's state, for the start-up health check (set once it's registered). */
  phoneLink?: () => { wanted: boolean; running: boolean; error: string | null };
  /** Shut down / restart / sleep with a countdown (set once ready). */
  power?: {
    schedule(
      action: 'shutdown' | 'restart' | 'sleep',
      seconds: number,
      why: string,
    ): Promise<string>;
    cancel(): Promise<string>;
    download?: import('./services/download-mode').DownloadMode;
  };
  /** Work shifts synced from the phone app. */
  shifts: import('./services/shift-store').ShiftStore;
  compact: CompactController;
  hotkey: Hotkey;
  voiceHotkey: Hotkey;
  openMicHotkey: Hotkey;
  clipboardHotkey: Hotkey;
  updateSettings(patch: Partial<Settings>): void;
  setCompact(on: boolean): void;
  showWindow(focusInput?: boolean): void;
  /** Show the window if hidden, without taking focus from the app in use. */
  peekWindow(): void;
  /** Screen awareness: grab the screen (before ARC appears over it). Set once ready. */
  captureScreen?(): Promise<void>;
  /** Agent Mode: start a task (set once ready). */
  startAgent?(task: string, opts?: import('./services/agent-runner').AgentOptions): unknown;
  stopAgent?(): void;
  pauseAgent?(on: boolean): void;
  /** Speaks text in the PC's Fish Audio voice (MP3), when a Fish key is saved. */
  fishSpeak?(text: string): Promise<Uint8Array>;
  fishReady?(): boolean;
  agentAnswer?(id: string, answer: string | boolean): void;
  /** Recent notifications (suggestions, agent questions, sessions) for the phone companion. */
  notify(text: string): void;
  /** Show an Approve / Deny card; resolves true only if the user approves. */
  askApproval?(title: string, detail?: string): Promise<boolean>;
  pendingApprovals?(): Array<{ id: string; title: string; detail: string }>;
  answerApproval?(id: string, ok: boolean): void;
  recentNotices(): Array<{ at: number; text: string }>;
  /** Recent gaming sessions with performance (set once gaming is registered). */
  gamingSessions?(): import('./services/gaming-sessions').GamingSession[];
  toggleWindow(): void;
  openSettings(): void;
  /** Send a request to the renderer (queued until it has loaded). */
  command(c: AppCommand): void;
  pushWindowState(): void;
  quit(): void;
}
