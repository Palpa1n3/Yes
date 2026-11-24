import { describe, expect, it } from 'vitest';
import { parsePluginLogLine, repeatedLead, type PluginLogLine } from '@shared/cpcrash';

const t = (s: string): number => {
  const [h, m, sec] = s.split(':').map(Number);
  return new Date(2026, 10, 24, h ?? 0, m ?? 0, sec ?? 0).getTime();
};

describe('a plugin acting just before every crash', () => {
  it('reads plugin log lines', () => {
    const l = parsePluginLogLine(
      '[2026-11-24 17:53:11.409] [info    ] [ 67812] [AppearanceRuntimePlugin] [FaceGraph] unregistered build',
    );
    expect(l?.at).toBe(new Date(2026, 10, 24, 17, 53, 11, 409).getTime());
    expect(l?.text).toContain('[FaceGraph] unregistered build');
    expect(parsePluginLogLine('no time here')).toBeNull();
  });

  it('blames the plugin that does the same thing seconds before each crash', () => {
    const where = 'Cyberpunk2077.exe+0x278938';
    const crashes = ['17:03:00', '17:23:16', '17:40:41', '17:53:14'].map((s) => ({
      at: t(s),
      where,
    }));
    const arp: PluginLogLine[] = [
      ['17:02:58', 'face 0xBBCAF2048CCC223E'],
      ['17:23:15', 'face 0xBBCAF2048CCC223E'],
      ['17:40:38', 'face 0xBBCAF2048CCC223E'],
      ['17:53:11', 'face 0xBBCAF2048CCC223E'],
      ['17:53:14', 'Game crashed in Cyberpunk2077.exe+0x278938'],
    ].map(([a, text]) => ({
      at: t(a ?? ''),
      text: `[info    ] [ 1] [AppearanceRuntimePlugin] ${text}`,
    }));
    const settings: PluginLogLine[] = crashes.map((c) => ({
      at: c.at - 1000,
      text: '[info] [Mod Settings] Key binding overrides, call 3',
    }));
    const rag: PluginLogLine[] = [{ at: t('17:53:01'), text: 'Hooked joint release' }];
    const lead = repeatedLead(
      crashes,
      new Map([
        ['mod_settings', settings],
        ['appearanceruntimeplugin', arp],
        ['ragdollphysicsoverhaul', rag],
      ]),
    );
    expect(lead?.plugin).toBe('appearanceruntimeplugin');
    expect(lead?.times).toBe(4);
  });

  it('needs at least three crashes at the same spot', () => {
    const crashes = [
      { at: t('17:00:00'), where: 'a' },
      { at: t('17:10:00'), where: 'a' },
    ];
    const lines = crashes.map((c) => ({ at: c.at - 500, text: 'x' }));
    expect(repeatedLead(crashes, new Map([['someplugin', lines]]))).toBeNull();
  });
});
