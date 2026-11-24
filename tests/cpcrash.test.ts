import { describe, expect, it } from 'vitest';
import { isFramework, parseCrashInfo, parseCrashProbe, summarizeCrashes } from '@shared/cpcrash';

const probe = (time: string, where: string, stack: string[]): string =>
  [
    `[CrashProbe] ARP 1.10.0, commit d55c083c5e21, ${time}`,
    `[CrashProbe] ACCESS VIOLATION: ${where} read at 0xFFFFFFFFFFFFFFFF`,
    '[CrashProbe] rax=00007FFE39409EB0 rbx=FFFFFFFB985A5D78',
    ...stack.map((s, i) => `[CrashProbe]   [rsp+0x0${i}8] ${s}`),
    '[CrashProbe]   [rsp+0x308] RED4ext.dll+0x80942',
    '[CrashProbe]   [rsp+0x448] ntdll.dll+0x27475',
  ].join('\n');

const plugins = new Map([
  ['radioext', 'RadioExt'],
  ['codeware', 'Codeware'],
  ['audioxl_2_50', 'AudioXL'],
]);

describe('Cyberpunk crash reports', () => {
  it('reads where it crashed and the mods on the stack', () => {
    const c = parseCrashProbe(
      'crash-2026-11-23_231622.txt',
      probe('2026-11-23 23:16:22', 'Cyberpunk2077.exe+0x2018029', [
        'Cyberpunk2077.exe+0x2017C81',
        'RadioExt.dll+0xA30F',
        'RadioExt.dll+0x6B10',
      ]),
    );
    expect(c).toMatchObject({ where: 'Cyberpunk2077.exe+0x2018029', mods: ['RadioExt.dll'] });
    expect(c?.at).toBe(new Date(2026, 10, 23, 23, 16, 22).getTime());
    expect(parseCrashProbe('x', 'nothing here')).toBeNull();
    expect(isFramework('Codeware.dll')).toBe(true);
    expect(isFramework('RadioExt.dll')).toBe(false);
  });
  it('blames a mod that is on the stack crash after crash', () => {
    const a = parseCrashProbe(
      'a',
      probe('2026-11-23 23:15:22', 'Cyberpunk2077.exe+0x1', ['RadioExt.dll+0x1']),
    );
    const b = parseCrashProbe(
      'b',
      probe('2026-11-23 23:16:22', 'Cyberpunk2077.exe+0x1', ['RadioExt.dll+0x2']),
    );
    const s = summarizeCrashes([a!, b!], plugins, null);
    expect(s.culprit).toEqual({ dll: 'RadioExt.dll', plugin: 'RadioExt', times: 2 });
    expect(s.verdict).toMatch(/inside the mod “RadioExt\.dll” \(2 crashes in a row\)/);
  });
  it('only reports frameworks, with where and when, plus TweakXL’s rejections', () => {
    const c = parseCrashProbe(
      'c',
      probe('2026-11-24 00:30:42', 'Cyberpunk2077.exe+0x278938', [
        'Cyberpunk2077.exe+0x1AC105',
        'Codeware.dll+0x1234',
      ]),
    );
    const ctx = parseCrashInfo(
      JSON.stringify({
        RootType: 'gameTelemetryPostMortemContainer',
        Data: {
          postMortem: {
            timeCrash: '2026-11-24T00:30:43Z',
            trackedQuest: { name: 'sq030_judy_romance' },
            district: 'CityCenter',
            sessionLength: 141.75,
          },
        },
      }),
    );
    expect(ctx).toMatchObject({
      quest: 'sq030_judy_romance',
      district: 'CityCenter',
      session: 141.75,
    });
    const s = summarizeCrashes(
      [c!],
      plugins,
      ctx,
      '[2026-11-24 00:27:58.758] [29996] [error] Items.Preset_Nova_RapidFire.npcRPGData: Cannot inline\n[x] [info] fine',
    );
    expect(s.culprit).toBeNull();
    expect(s.frameworks).toEqual(['Codeware.dll']);
    expect(s.tweakErrors).toEqual({
      count: 1,
      examples: ['Items.Preset_Nova_RapidFire.npcRPGData: Cannot inline'],
    });
    expect(s.verdict).toMatch(
      /after 2 minutes of play in CityCenter, in its own code, with Codeware\.dll involved/,
    );
    expect(s.verdict).toMatch(/TweakXL rejected 1 change/);
  });
});
