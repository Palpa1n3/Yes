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
import { applyProgress, useRoutinesStore } from '@renderer/stores/routinesStore';
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

describe('real-model actions', () => {
  it('reports the action outcome back to the model, without ARC adding its own failure line', async () => {
    void conv().send('open nonexistent');
    conv().handleChunk({
      type: 'intent',
      responseId: rid(),
      intent: { action: 'launch_app', target: 'nonexistent' },
      toolUseId: 'tu9',
    });
    resolveExec?.(false);
    await vi.waitFor(() =>
      expect(window.arc.assistant.toolResult).toHaveBeenCalledWith(rid(), 'tu9', {
        status: 'failed',
        message: 'nope',
      }),
    );
    expect(assistantTexts()).toEqual([]); // Claude explains failures itself
  });

  it('notices appear as info lines without ending the reply', () => {
    void conv().send('hi');
    conv().handleChunk({ type: 'notice', responseId: rid(), message: 'Offline, using the mock.' });
    expect(conv().messages.at(-1)).toMatchObject({
      role: 'system',
      tone: 'info',
      text: 'Offline, using the mock.',
    });
    expect(conv().activeResponseId).toBe(rid());
  });
});

describe('routines from the console', () => {
  beforeEach(() => {
    useRoutinesStore.setState({
      routines: [
        {
          id: 'focus-mode',
          name: 'Focus mode',
          icon: 'Target',
          phrases: ['work mode'],
          steps: [{ kind: 'say', target: 'Go' }],
          runAtStartup: false,
        },
      ],
    });
  });

  it('runs a routine phrase locally, without asking the AI, as one card', async () => {
    const done = conv().send('Work mode!');
    expect(window.arc.assistant.send).not.toHaveBeenCalled();
    const card = conv().messages.find((m) => m.role === 'command');
    expect(card?.role === 'command' && card.command.cmd).toMatchObject({
      action: 'run_routine',
      target: 'focus-mode',
    });
    expect(card?.role === 'command' && card.command.status).toBe('pending');
    expect(useAssistantStore.getState().stateDetail).toBe('Routine · Focus mode');
    resolveExec?.(true);
    await done;
    const after = conv().messages.find((m) => m.role === 'command');
    expect(after?.role === 'command' && after.command.status).toBe('success');
    expect(conv().activeResponseId).toBeNull();
  });

  it('sends anything else to the AI as usual', () => {
    void conv().send('what is focus mode for?');
    expect(window.arc.assistant.send).toHaveBeenCalledTimes(1);
  });

  it('tracks a run in the log', () => {
    const p = { routineId: 'r', name: 'R', total: 2, message: '' };
    let run = applyProgress(null, { ...p, index: 0, status: 'running' });
    run = applyProgress(run, { ...p, index: 0, status: 'success', message: 'ok' });
    expect(run.finished).toBe(false);
    run = applyProgress(run, { ...p, index: 1, status: 'failed', message: 'nope' });
    expect(run).toEqual({
      routineId: 'r',
      name: 'R',
      finished: true,
      steps: [
        { status: 'success', message: 'ok' },
        { status: 'failed', message: 'nope' },
      ],
    });
    // A new run of the same routine starts a fresh log.
    expect(applyProgress(run, { ...p, index: 0, status: 'running' }).steps[1]).toBeUndefined();
  });
});
