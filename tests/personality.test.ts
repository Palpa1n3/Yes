import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toCommand } from '@shared/commands';
import {
  DEFAULT_PERSONALITY,
  PRESETS,
  buildSystemPrompt,
  dayPart,
  pickGreeting,
  presetById,
  renderPhrase,
  resolveTitle,
  sanitizePersonality,
} from '@shared/personalities';
import { sanitizeSettings } from '@shared/settings';
import {
  DEFAULT_SETTINGS,
  responseIdFor,
  type AssistantResponse,
  type UserMessage,
} from '@shared/types';
import { toAccelerator } from '@renderer/components/settings/HotkeyRecorder';
import {
  failureLine,
  needsConfirmation,
  useConversationStore,
} from '@renderer/stores/conversationStore';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { installArcMock } from './arcMock';

describe('personalities', () => {
  it('ships the four presets from the spec', () => {
    expect(PRESETS.map((p) => p.name)).toEqual(['Butler', 'Co-pilot', 'Terminal', 'Mentor']);
    expect(presetById('butler')).toMatchObject({ userTitle: 'sir', humour: 2, verbosity: 2 });
    expect(presetById('terminal')).toMatchObject({ humour: 0, verbosity: 1 });
    expect(presetById('mentor')?.verbosity).toBe(5);
    expect(presetById('copilot')).toMatchObject({ proactivity: 2, userTitle: '{name}' });
  });

  it('renders titles, or tidies them away when empty', () => {
    expect(renderPhrase('Good evening{,title}.', 'sir')).toBe('Good evening, sir.');
    expect(renderPhrase('Good evening{,title}.', '')).toBe('Good evening.');
    expect(resolveTitle('{name}', 'Jack')).toBe('Jack');
    expect(resolveTitle('boss', 'Jack')).toBe('boss');
  });

  it('late night is 00:00–05:00 and uses the late-night pool', () => {
    expect([0, 4, 5, 11, 12, 17, 18, 23].map(dayPart)).toEqual([
      'lateNight',
      'lateNight',
      'morning',
      'morning',
      'afternoon',
      'afternoon',
      'evening',
      'evening',
    ]);
    expect(pickGreeting(DEFAULT_PERSONALITY, 'sir', 2, 0)).toBe(
      'Working late again, sir? All systems are nominal.',
    );
  });

  it('system prompt reflects the sliders', () => {
    const terse = buildSystemPrompt({ ...DEFAULT_PERSONALITY, verbosity: 1, humour: 0 }, '');
    expect(terse).toMatch(/few words/);
    expect(terse).toMatch(/Never joke/);
    expect(buildSystemPrompt({ ...DEFAULT_PERSONALITY, userTitle: '{name}' }, 'Jack')).toMatch(
      /Address the user as "Jack"/,
    );
  });

  it('sanitizes stored personalities field by field', () => {
    const p = sanitizePersonality({
      name: 'Mine',
      verbosity: 9,
      humour: 1,
      tone: 'rude',
      greetings: { morning: ['Hi'] },
    });
    expect(p).toMatchObject({
      name: 'Mine',
      verbosity: DEFAULT_PERSONALITY.verbosity,
      humour: 1,
      tone: DEFAULT_PERSONALITY.tone,
    });
    expect(p.greetings.morning).toEqual(['Hi']);
    expect(p.greetings.evening).toEqual(DEFAULT_PERSONALITY.greetings.evening);
  });
});

describe('settings sanitizer', () => {
  it('fills defaults, drops unknown keys and bad types', () => {
    const s = sanitizeSettings({
      theme: 'neon',
      sfxVolume: 4,
      scanlines: 'yes',
      hacker: true,
      assistantName: '  ',
    });
    // Settings saved by an older version count as already set up (no setup guide).
    expect(s).toEqual({ ...DEFAULT_SETTINGS, onboarded: true });
    expect(sanitizeSettings(null)).toEqual({ ...DEFAULT_SETTINGS, onboarded: true });
    expect(sanitizeSettings({ ...DEFAULT_SETTINGS }).onboarded).toBe(false);
  });
  it('keeps valid values and mirrors the name into the personality', () => {
    const s = sanitizeSettings({ assistantName: 'JEEVES', theme: 'mono', sfxVolume: 0.5 });
    expect(s).toMatchObject({ assistantName: 'JEEVES', theme: 'mono', sfxVolume: 0.5 });
    expect(s.personality.assistantName).toBe('JEEVES');
  });
});

describe('hotkey recorder', () => {
  const key = (
    code: string,
    mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {},
  ) =>
    toAccelerator({
      key: '',
      code,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      ...mods,
    });
  it('builds Electron accelerators and requires a modifier', () => {
    expect(key('Space', { ctrlKey: true })).toBe('CommandOrControl+Space');
    expect(key('KeyJ', { altKey: true, shiftKey: true })).toBe('Alt+Shift+J');
    expect(key('F9')).toBe('F9');
    expect(key('KeyJ')).toBeNull();
    expect(key('ControlLeft', { ctrlKey: true })).toBeNull();
  });
});

describe('confirmation and personality phrasing', () => {
  let lastSent: UserMessage | null = null;
  beforeEach(() => {
    const arc = installArcMock();
    arc.assistant.send = vi.fn((m: UserMessage) => {
      lastSent = m;
      return new Promise<AssistantResponse>(() => undefined);
    });
    arc.commands.execute = vi.fn(async (cmd) => ({
      commandId: cmd.id,
      status: 'success' as const,
      message: 'ok',
      timestamp: 0,
    }));
    useConversationStore.setState({ messages: [], activeResponseId: null, activeBubbleId: null });
  });
  const setPersonality = (id: string) =>
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, userName: 'Jack', personality: presetById(id)! },
    });

  it('needsConfirmation follows the mode and risk', () => {
    const safe = toCommand({ action: 'start', target: 'spotify' }, '1');
    expect(needsConfirmation(safe, 'always')).toBe(true);
    expect(needsConfirmation(safe, 'destructive-only')).toBe(false);
    expect(needsConfirmation({ ...safe, risk: 'destructive' }, 'destructive-only')).toBe(true);
    expect(needsConfirmation({ ...safe, risk: 'destructive' }, 'never')).toBe(false);
  });

  it('Mentor (always confirm) waits for Approve before executing', async () => {
    setPersonality('mentor');
    void useConversationStore.getState().send('open spotify');
    useConversationStore.getState().handleChunk({
      type: 'intent',
      responseId: responseIdFor(lastSent!.id),
      intent: { action: 'start', target: 'spotify' },
    });
    const card = () => useConversationStore.getState().messages.find((m) => m.role === 'command');
    expect(card()).toMatchObject({ command: { status: 'awaiting' } });
    expect(window.arc.commands.execute).not.toHaveBeenCalled();
    useConversationStore.getState().approve(card()!.id);
    await vi.waitFor(() => expect(card()).toMatchObject({ command: { status: 'success' } }));
  });

  it('Cancel marks the card cancelled and never runs it', () => {
    setPersonality('mentor');
    void useConversationStore.getState().send('open spotify');
    useConversationStore.getState().handleChunk({
      type: 'intent',
      responseId: responseIdFor(lastSent!.id),
      intent: { action: 'start', target: 'spotify' },
    });
    const id = useConversationStore.getState().messages.find((m) => m.role === 'command')!.id;
    useConversationStore.getState().reject(id);
    expect(useConversationStore.getState().messages.find((m) => m.id === id)).toMatchObject({
      command: { status: 'cancelled' },
    });
    expect(window.arc.commands.execute).not.toHaveBeenCalled();
  });

  it('failure lines use the personality error phrases and title', () => {
    setPersonality('terminal');
    expect(failureLine(toCommand({ action: 'start', target: 'x' }, '1'), 'Not found.')).toMatch(
      /^(Failed\.|Error\.) Not found\./,
    );
    setPersonality('butler');
    expect(failureLine(toCommand({ action: 'start', target: 'x' }, '1'), 'Not found.')).not.toMatch(
      /\{|title/,
    );
  });
});
