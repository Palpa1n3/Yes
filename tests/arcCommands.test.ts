import { describe, expect, it } from 'vitest';
import { normaliseCommand, parseArcCommand } from '@shared/arcCommands';

const p = parseArcCommand;

describe('ARC commands', () => {
  it('strips politeness and filler', () => {
    expect(normaliseCommand('Hey ARC, could you open my notes please?')).toBe('open notes');
    expect(normaliseCommand('Can you show me the task manager')).toBe('show me task manager');
  });

  it('opens tabs and settings by their own names only', () => {
    expect(p('open notes')).toEqual({ action: 'open_tab', value: 'notes' });
    expect(p('show me my shopping list')).toEqual({ action: 'open_tab', value: 'notes' });
    expect(p('go to storage')).toEqual({ action: 'open_tab', value: 'storage' });
    expect(p('open task manager')).toEqual({ action: 'open_tab', value: 'tasks' });
    expect(p('open chats')).toEqual({ action: 'open_tab', value: 'chat' });
    expect(p('open settings')).toEqual({ action: 'open_settings' });
    expect(p('open gaming settings')).toEqual({ action: 'open_settings', value: 'gaming' });
    expect(p('open spotify')).toBeNull(); // still an app launch, handled elsewhere
    expect(p('open youtube.com')).toBeNull();
  });

  it('chats and research', () => {
    expect(p('new chat')).toEqual({ action: 'new_chat' });
    expect(p('Start a new conversation')).toEqual({ action: 'new_chat' });
    expect(p('new research chat')).toEqual({ action: 'research' });
    expect(p('research the best budget gaming headset')).toEqual({
      action: 'research',
      value: 'best budget gaming headset',
    });
    expect(p('do some research on electric cars')).toEqual({
      action: 'research',
      value: 'electric cars',
    });
    expect(p('turn research mode on')).toEqual({ action: 'research_on' });
    expect(p('research off')).toEqual({ action: 'research_off' });
    expect(p('switch to my dinner ideas chat')).toEqual({
      action: 'switch_chat',
      value: 'dinner ideas',
    });
    expect(p('export this chat')).toEqual({ action: 'export_chat' });
    expect(p('pin this chat')).toEqual({ action: 'pin_chat' });
    expect(p('rename this chat to Holiday plans')).toEqual({
      action: 'rename_chat',
      value: 'holiday plans',
    });
  });

  it('cleanup, gaming and music', () => {
    expect(p('free up some space')).toEqual({ action: 'scan_space' });
    expect(p('clean up my PC')).toEqual({ action: 'scan_space' });
    expect(p('how much space can I free?')).toEqual({ action: 'scan_space' });
    expect(p('start gaming mode')).toEqual({ action: 'gaming_on' });
    expect(p('gaming mode off')).toEqual({ action: 'gaming_off' });
    expect(p('pause the music')).toEqual({ action: 'media_control', target: 'play_pause' });
    expect(p('next song')).toEqual({ action: 'media_control', target: 'next' });
    expect(p('previous track')).toEqual({ action: 'media_control', target: 'previous' });
    expect(p('stop')).toBeNull();
  });

  it('open mic on/off', () => {
    expect(p('open mic off')).toEqual({ action: 'open_mic_off' });
    expect(p("that's all listening")).toEqual({ action: 'open_mic_off' });
    expect(p('turn open mic on')).toEqual({ action: 'open_mic_on' });
  });

  it('leaves normal questions to the AI', () => {
    for (const q of [
      'what is the capital of peru',
      'how do I research a family tree?',
      'open the door to new ideas in my essay',
      'tell me a joke',
    ])
      expect(p(q)).toBeNull();
  });
});

describe('whisper mode commands', () => {
  it('turns whisper mode on and off', async () => {
    const { parseArcCommand } = await import('@shared/arcCommands');
    expect(parseArcCommand('whisper mode')?.action).toBe('whisper_on');
    expect(parseArcCommand('speak quietly')?.action).toBe('whisper_on');
    expect(parseArcCommand('whisper mode off')?.action).toBe('whisper_off');
    expect(parseArcCommand('speak normally')?.action).toBe('whisper_off');
  });
});
