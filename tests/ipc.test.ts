import { describe, expect, it } from 'vitest';
import { IPC } from '@shared/ipc';

const allChannels = Object.entries(IPC).flatMap(([group, channels]) =>
  Object.values(channels).map((ch) => ({ group, ch })),
);

describe('IPC channel contract', () => {
  it('has unique channel names', () => {
    const names = allChannels.map((c) => c.ch);
    expect(new Set(names).size).toBe(names.length);
  });

  it('namespaces every channel by its group', () => {
    for (const { group, ch } of allChannels) expect(ch.startsWith(`${group}:`)).toBe(true);
  });

  it('exposes the groups the ArcAPI requires', () => {
    expect(Object.keys(IPC).sort()).toEqual(
      [
        'agent',
        'ai',
        'app',
        'apps',
        'approval',
        'assistant',
        'calendar',
        'chats',
        'cleanup',
        'clipboard',
        'commands',
        'desk',
        'discord',
        'email',
        'gaming',
        'initiative',
        'media',
        'mods',
        'network',
        'notes',
        'previews',
        'remote',
        'routines',
        'settings',
        'smarthome',
        'storage',
        'system',
        'tasks',
        'timers',
        'updates',
        'voice',
        'weather',
        'window',
      ].sort(),
    );
  });
});
