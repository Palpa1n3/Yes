import { describe, expect, it } from 'vitest';
import {
  OUTSIDE_TURNS,
  OutsideContent,
  clickTarget,
  outsideApproval,
  riskyButton,
  riskyTool,
} from '@shared/tool-guard';

describe('outside content can’t unlock risky tools', () => {
  it('knows which tools are risky, looking at what they’d do', () => {
    expect(riskyTool('post_to_discord', { text: 'hi' })).toBe('post a message to Discord');
    expect(riskyTool('open_url', { url: 'https://x.test/?q=secret' })).toBe(
      'open a web link (https://x.test/?q=secret)',
    );
    expect(riskyTool('remember', { text: 'x' })).toBe('save something to memory');
    expect(riskyTool('cyberpunk_mods', { action: 'diagnose' })).toBeNull();
    expect(riskyTool('cyberpunk_mods', { action: 'install' })).toBe('change your Cyberpunk mods');
    expect(riskyTool('shop', { goal: 'find' })).toBeNull();
    expect(riskyTool('shop', { goal: 'buy' })).toBe('make an offer or buy something');
    expect(riskyTool('power_pc', { action: 'cancel' })).toBeNull();
    expect(riskyTool('get_weather', {})).toBeNull();
    expect(riskyTool('add_note', { text: 'x' })).toBeNull();
  });

  it('stays locked for the turn the content was read and the next two', () => {
    const o = new OutsideContent();
    o.newTurn();
    o.saw('get_weather');
    expect(o.active).toBe(false);
    o.saw('read_email');
    o.saw('web_fetch');
    expect(o.active).toBe(true);
    expect(o.sources()).toEqual(['email', 'web page']);
    for (let i = 1; i < OUTSIDE_TURNS; i++) {
      o.newTurn();
      expect(o.active).toBe(true);
    }
    o.newTurn();
    expect(o.active).toBe(false);
    expect(o.sources()).toEqual([]);
    expect(outsideApproval('post a message to Discord', ['email']).title).toBe(
      'Alton wants to post a message to Discord',
    );
  });
});

describe('Agent Mode buttons', () => {
  it('finds the button a click lands on and spots risky ones', () => {
    const parts = [
      { type: 'ControlType.Text', name: 'Send' },
      { type: 'ControlType.Button', name: 'Send message' },
      { type: 'ControlType.Pane', name: 'Mail' },
    ];
    expect(clickTarget(parts)).toEqual({ type: 'ControlType.Button', name: 'Send message' });
    expect(riskyButton(clickTarget(parts))).toBe('Send message');
    for (const n of ['Buy it now', 'Place your order', 'Delete', 'Pay £12.99', 'Install', 'Submit'])
      expect(riskyButton({ type: 'ControlType.Button', name: n })).toBe(n);
    for (const n of ['Search', 'Next page', 'Sender details', 'Add to basket', 'Settings', ''])
      expect(riskyButton({ type: 'ControlType.Button', name: n })).toBeNull();
    expect(riskyButton(null)).toBeNull();
  });
});
