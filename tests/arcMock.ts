import { vi } from 'vitest';
import type { ArcAPI } from '@shared/ipc';
import { DEFAULT_SETTINGS } from '@shared/types';

/** A fake window.arc for renderer tests. */
export function installArcMock(): ArcAPI {
  const api: ArcAPI = {
    window: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      getState: vi.fn(async () => ({ maximized: false, compact: false })),
      setCompact: vi.fn(),
      peek: vi.fn(),
      onState: vi.fn(() => () => undefined),
    },
    system: {
      getStats: vi.fn(),
      getInfo: vi.fn(async () => ({
        hostname: 'TEST-PC',
        username: 'me',
        platform: 'win32',
        osName: 'Windows 11',
        osRelease: '10.0.22631',
        arch: 'x64',
        cpuModel: 'Test CPU',
        cpuThreads: 8,
        memTotal: 16 * 1024 ** 3,
      })),
      setDetail: vi.fn(),
      onStats: vi.fn(() => () => undefined),
    },
    assistant: {
      send: vi.fn(),
      cancel: vi.fn(),
      toolResult: vi.fn(),
      reset: vi.fn(),
      onStream: vi.fn(() => () => undefined),
    },
    timers: {
      list: vi.fn(async () => []),
      add: vi.fn(async () => []),
      cancel: vi.fn(),
      snooze: vi.fn(),
      onChange: vi.fn(() => () => undefined),
      onRing: vi.fn(() => () => undefined),
    },
    calendar: {
      get: vi.fn(async () => ({ configured: false, events: [], fetchedAt: null, error: null })),
      refresh: vi.fn(async () => ({ configured: false, events: [], fetchedAt: null, error: null })),
      setUrl: vi.fn(async () => ({ ok: true, message: '' })),
      clearUrl: vi.fn(async () => ({
        configured: false,
        events: [],
        fetchedAt: null,
        error: null,
      })),
      onChange: vi.fn(() => () => undefined),
      onReminder: vi.fn(() => () => undefined),
    },
    tasks: {
      list: vi.fn(async () => ({ tasks: [], at: 0 })),
      end: vi.fn(async () => ({ ok: true, message: '' })),
    },
    voice: {
      status: vi.fn(async () => ({
        fishKey: false,
        stt: { state: 'idle' as const, progress: null, model: 'base' as const },
      })),
      setFishKey: vi.fn(async () => ({ ok: true, message: '' })),
      clearFishKey: vi.fn(async () => ({
        fishKey: false,
        stt: { state: 'idle' as const, progress: null, model: 'base' as const },
      })),
      speak: vi.fn(async () => new Uint8Array()),
      transcribe: vi.fn(async () => ''),
      prepare: vi.fn(),
      onStatus: vi.fn(() => () => undefined),
    },
    routines: {
      list: vi.fn(async () => []),
      save: vi.fn(async () => []),
      remove: vi.fn(async () => []),
      stop: vi.fn(),
      startup: vi.fn(async () => []),
      onChange: vi.fn(() => () => undefined),
      onProgress: vi.fn(() => () => undefined),
    },
    weather: {
      get: vi.fn(async () => ({ data: null, error: null })),
      refresh: vi.fn(async () => ({ data: null, error: null })),
      search: vi.fn(async () => []),
      onChange: vi.fn(() => () => undefined),
    },
    ai: {
      status: vi.fn(async () => ({ hasKey: false, encryptionAvailable: true })),
      setKey: vi.fn(async () => ({ ok: true, message: 'ok' })),
      clearKey: vi.fn(async () => ({ hasKey: false, encryptionAvailable: true })),
      test: vi.fn(async () => ({ ok: true, message: 'ok' })),
    },
    commands: { execute: vi.fn() },
    settings: {
      get: vi.fn(async () => DEFAULT_SETTINGS),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    },
    apps: {
      list: vi.fn(async () => [
        {
          id: 'vscode',
          name: 'VS Code',
          startMenu: 'Visual Studio Code',
          intents: ['vs code', 'my editor'],
        },
      ]),
      installed: vi.fn(async () => []),
      save: vi.fn(async () => []),
      remove: vi.fn(async () => []),
      folders: vi.fn(async () => []),
      openFolder: vi.fn(),
    },
    network: {
      details: vi.fn(async () => ({
        hostname: 'TEST-PC',
        gateway: null,
        dns: [],
        interfaces: [],
        wifi: null,
      })),
      latency: vi.fn(async () => []),
    },
    storage: {
      downloads: vi.fn(async () => []),
      scan: vi.fn(async () => []),
      reveal: vi.fn(),
      openSpecial: vi.fn(),
    },
    history: { get: vi.fn(async () => []), save: vi.fn(), clear: vi.fn() },
    app: {
      onCommand: vi.fn(() => () => undefined),
      getInfo: vi.fn(async () => ({
        version: '0.1.0',
        electron: '45',
        platform: 'win32',
        userDataPath: 'C:/x',
        activeHotkey: 'CommandOrControl+Space',
        activeVoiceHotkey: 'CommandOrControl+Alt+Space',
      })),
      openPath: vi.fn(),
      resetSettings: vi.fn(async () => DEFAULT_SETTINGS),
    },
  };
  window.arc = api;
  return api;
}
