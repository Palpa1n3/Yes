import { beforeEach, describe, expect, it } from 'vitest';
import { toCommand } from '@shared/commands';
import { DEFAULT_SETTINGS } from '@shared/types';
import {
  needsConfirmation,
  permissionFor,
  useConversationStore,
} from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { installArcMock } from './arcMock';

let arc: ReturnType<typeof installArcMock>;
beforeEach(() => {
  arc = installArcMock();
  useConversationStore.setState({ messages: [] });
});

describe('tiered permissions', () => {
  it('ask / allow / block per kind of action', () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        permissions: { ...DEFAULT_SETTINGS.permissions, launch_app: 'ask', lock_screen: 'block' },
      },
    });
    const open = toCommand({ action: 'launch_app', target: 'spotify' }, '1');
    expect(permissionFor(open)).toBe('ask');
    expect(needsConfirmation(open, 'destructive-only')).toBe(true);
    const vol = toCommand({ action: 'set_volume', target: '30' }, '2');
    expect(needsConfirmation(vol, 'destructive-only')).toBe(false);
    expect(permissionFor(toCommand({ action: 'lock_screen' }, '3'))).toBe('block');
  });

  it('blocked actions never run and Claude is told', () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        permissions: { ...DEFAULT_SETTINGS.permissions, lock_screen: 'block' },
      },
    });
    useConversationStore.setState({ activeResponseId: 'r-1' });
    useConversationStore.getState().handleChunk({
      type: 'intent',
      responseId: 'r-1',
      toolUseId: 't1',
      intent: { action: 'lock_screen' },
    });
    const card = useConversationStore.getState().messages.find((m) => m.role === 'command');
    expect(card).toMatchObject({ command: { status: 'failed' } });
    expect(arc.commands.execute).not.toHaveBeenCalled();
    expect(arc.assistant.toolResult).toHaveBeenCalledWith(
      'r-1',
      't1',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
