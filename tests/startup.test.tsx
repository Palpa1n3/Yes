import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type StoredMessage } from '@shared/types';
import { useConversationStore } from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { webSpeechOutput } from '@renderer/voice/providers';
import { useSpeechOutput } from '@renderer/voice/useSpeechOutput';
import { installArcMock } from './arcMock';

const old: StoredMessage = {
  id: 'old-1',
  role: 'assistant',
  text: 'An old reply from yesterday.',
  timestamp: Date.now() - 86_400_000,
  streaming: false,
  revealed: true,
};

beforeEach(() => {
  const arc = installArcMock();
  arc.settings.get = vi.fn(async () => ({
    ...DEFAULT_SETTINGS,
    bootSequence: false,
    persistHistory: true,
  }));
  arc.chats.open = vi.fn(async () => [old]);
  useConversationStore.setState({ messages: [] });
});

describe('start-up', () => {
  it('greets once even when start-up runs twice (React dev mode)', async () => {
    const { startSession } = await import('@renderer/session');
    await Promise.all([startSession(), startSession()]);
    const greetings = useConversationStore
      .getState()
      .messages.filter((m) => m.id.startsWith('session-greet'));
    expect(greetings).toHaveLength(1);
    expect(useConversationStore.getState().messages.filter((m) => m.id === 'old-1')).toHaveLength(
      1,
    );
  });

  it('does not read restored messages aloud, only new ones', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, speakReplies: true },
      loaded: true,
    });
    Object.defineProperty(webSpeechOutput, 'available', { value: true, configurable: true });
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speaking: false, pending: false });
    const speak = vi.spyOn(webSpeechOutput, 'speak').mockImplementation(() => undefined);
    function Harness() {
      useSpeechOutput();
      return null;
    }
    render(<Harness />);
    act(() => useConversationStore.getState().restore([old]));
    expect(speak).not.toHaveBeenCalled();
    act(() => useConversationStore.getState().pushAssistant('Hello now.'));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0]).toBe('Hello now.');
  });
});
