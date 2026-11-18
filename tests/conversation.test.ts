import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalCommand, CommandResult } from '@shared/commands';
import { responseIdFor, type AssistantResponse, type UserMessage } from '@shared/types';
import { useAppsStore } from '@renderer/stores/appsStore';
import { useAssistantStore } from '@renderer/stores/assistantStore';
import {
  deriveState,
  useConversationStore,
  type Message,
} from '@renderer/stores/conversationStore';
import { installArcMock } from './arcMock';

const conv = () => useConversationStore.getState();
const state = () => useAssistantStore.getState().state;
let lastSent: UserMessage | null = null;
let resolveExec: ((ok: boolean) => void) | null = null;

beforeEach(() => {
  const arc = installArcMock();
  lastSent = null;
  arc.assistant.send = vi.fn((msg: UserMessage) => {
    lastSent = msg;
    return new Promise<AssistantResponse>(() => undefined); // chunks are fed manually below
  });
  arc.commands.execute = vi.fn(
    (cmd: CanonicalCommand) =>
      new Promise<CommandResult>((resolve) => {
        resolveExec = (ok) =>
          resolve({
            commandId: cmd.id,
            status: ok ? 'success' : 'failed',
            message: ok ? 'done' : 'nope',
            timestamp: 0,
          });
      }),
  );
  useConversationStore.setState({
    messages: [],
    activeResponseId: null,
    activeBubbleId: null,
    inputHistory: [],
  });
  useAssistantStore.setState({ state: 'idle', stateDetail: undefined });
  useAppsStore.setState({ apps: [{ id: 'vscode', name: 'VS Code', intents: ['vs code'] }] });
});

const rid = () => responseIdFor(lastSent?.id ?? '');
const assistantTexts = () =>
  conv()
    .messages.filter((m): m is Extract<Message, { role: 'assistant' }> => m.role === 'assistant')
    .map((m) => m.text);

describe('conversation loop', () => {
  it('thinking -> speaking -> executing -> speaking -> idle', async () => {
    void conv().send('open vscode');
    expect(state()).toBe('thinking');
    expect(conv().inputHistory).toEqual(['open vscode']);

    conv().handleChunk({ type: 'text', responseId: rid(), delta: 'Right away.' });
    conv().handleChunk({ type: 'text', responseId: rid(), delta: ' Launching.' });
    expect(state()).toBe('speaking');
    expect(assistantTexts()).toEqual(['Right away. Launching.']);

    conv().handleChunk({
      type: 'intent',
      responseId: rid(),
      intent: { action: 'open app', target: 'vscode' },
    });
    expect(state()).toBe('executing');
    expect(useAssistantStore.getState().stateDetail).toBe('Launching · VS Code');
    const card = conv().messages.find((m) => m.role === 'command');
    expect(card?.role === 'command' && card.command.cmd.action).toBe('launch_app');

    resolveExec?.(true);
    await vi.waitFor(() =>
      expect(conv().messages.find((m) => m.role === 'command')).toMatchObject({
        command: { status: 'success' },
      }),
    );
    expect(useAssistantStore.getState().activity[0]).toMatchObject({
      kind: 'app',
      status: 'success',
    });

    conv().handleChunk({ type: 'text', responseId: rid(), delta: 'Anything else?' });
    conv().handleChunk({ type: 'done', responseId: rid() });
    // Follow-up text after a card opens a new bubble below it.
    expect(assistantTexts()).toEqual(['Right away. Launching.', 'Anything else?']);
    expect(state()).toBe('speaking'); // typewriter still revealing

    for (const m of conv().messages) if (m.role === 'assistant') conv().markRevealed(m.id);
    expect(state()).toBe('idle');
  });

  it('a failed command flashes error', async () => {
    void conv().send('open nonexistent');
    conv().handleChunk({
      type: 'intent',
      responseId: rid(),
      intent: { action: 'start', target: 'nonexistent' },
    });
    resolveExec?.(false);
    await vi.waitFor(() => expect(state()).toBe('error'));
    // ARC explains the failure and suggests a next step, rather than going quiet.
    const followUp = assistantTexts().at(-1) ?? '';
    expect(followUp).toContain('nope');
    expect(followUp).toMatch(/search for nonexistent/);
  });

  it('ignores chunks from a superseded response', () => {
    void conv().send('first');
    const old = rid();
    void conv().send('second');
    conv().handleChunk({ type: 'text', responseId: old, delta: 'stale' });
    expect(assistantTexts()).toEqual([]);
    expect(conv().inputHistory).toEqual(['first', 'second']);
  });

  it('provider errors become an error line and the error state', () => {
    void conv().send('break');
    conv().handleChunk({ type: 'error', responseId: rid(), message: 'boom' });
    const last = conv().messages.at(-1);
    expect(last).toMatchObject({ role: 'system', tone: 'error' });
    expect(state()).toBe('error');
    expect(conv().activeResponseId).toBeNull();
  });

  it('clear empties the transcript and resets main-side history', () => {
    conv().pushSystem('hello');
    conv().clear();
    expect(conv().messages).toEqual([]);
    expect(window.arc.assistant.reset).toHaveBeenCalled();
  });

  it('deriveState: thinking only until the first chunk', () => {
    expect(
      deriveState({
        messages: [{ id: 'u', role: 'user', text: 'hi', timestamp: 0 }],
        activeResponseId: 'r',
      }),
    ).toBe('thinking');
    expect(deriveState({ messages: [], activeResponseId: null })).toBe('idle');
  });
});
