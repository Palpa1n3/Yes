import { describe, expect, it } from 'vitest';
import {
  findProblems,
  logProblems,
  modrinthProjectFor,
  parseCrashReport,
  parseFabricMod,
  versionMatches,
  type McMod,
} from '@shared/mcmods';

const mod = (p: Partial<McMod> & { id: string }): McMod => ({
  file: `${p.id}.jar`,
  enabled: true,
  name: p.id,
  version: '1.0.0',
  depends: {},
  breaks: {},
  provides: [],
  library: false,
  ...p,
});

describe('Minecraft mods', () => {
  it('reads fabric.mod.json', () => {
    const m = parseFabricMod(
      JSON.stringify({
        schemaVersion: 1,
        id: 'distanthorizons',
        name: 'Distant Horizons',
        version: '2.3.0',
        depends: { minecraft: ['~1.21.10', '26.3'], fabricloader: '>=0.16' },
        breaks: { optifabric: '*' },
        provides: ['dh'],
        jars: [{ file: 'META-INF/jars/lib.jar' }],
      }),
    );
    expect(m).toMatchObject({
      id: 'distanthorizons',
      name: 'Distant Horizons',
      depends: { minecraft: ['~1.21.10', '26.3'], fabricloader: ['>=0.16'] },
      breaks: { optifabric: ['*'] },
      provides: ['dh'],
      jars: ['META-INF/jars/lib.jar'],
    });
    expect(parseFabricMod('not json')).toBeNull();
  });
  it('matches Fabric version ranges', () => {
    expect(versionMatches(['*'], '26.3')).toBe(true);
    expect(versionMatches(['1.21.x'], '1.21.10')).toBe(true);
    expect(versionMatches(['1.21.x'], '26.3')).toBe(false);
    expect(versionMatches(['>=1.21 <1.22'], '1.21.10')).toBe(true);
    expect(versionMatches(['~1.21.1'], '1.21.10')).toBe(true);
    expect(versionMatches(['~1.21.1'], '1.22')).toBe(false);
    expect(versionMatches(['1.21.10', '26.3'], '26.3')).toBe(true);
    expect(versionMatches(['>=26.3-alpha'], '26.3')).toBe(true);
  });
  it('finds wrong versions, missing mods, duplicates and breaks', () => {
    const p = findProblems(
      [
        mod({
          id: 'distanthorizons',
          name: 'Distant Horizons',
          depends: { minecraft: ['1.21.x'], chunky: ['*'] },
        }),
        mod({
          id: 'sodium',
          version: '0.6.0',
          depends: { 'fabric-api': ['*'], fabricloader: ['>=0.16'] },
        }),
        mod({ id: 'sodium', file: 'sodium-old.jar', version: '0.5.0' }),
        mod({ id: 'fabric-api', library: true }),
        mod({
          id: 'fabric-api',
          file: 'dependencies/fabric-api-old.jar',
          version: '0.9',
          library: true,
        }),
        mod({ id: 'optifabric', name: 'OptiFabric' }),
        mod({ id: 'iris', name: 'Iris', breaks: { optifabric: ['*'] } }),
        mod({ id: 'off', enabled: false, depends: { nothere: ['*'] } }),
      ],
      '26.3',
    );
    expect(p.map((x) => [x.kind, x.modId, x.needs ?? ''])).toEqual([
      ['wrong-version', 'distanthorizons', ''],
      ['missing', 'distanthorizons', 'chunky'],
      ['breaks', 'optifabric', ''],
      ['duplicate', 'sodium', ''],
    ]);
    expect(p[3]?.file).toBe('sodium-old.jar');
  });
  it('reads crash reports and loader complaints', () => {
    const c = parseCrashReport(`---- Minecraft Crash Report ----
Description: Initializing game

java.lang.RuntimeException: boom
A detailed walkthrough of the error

Suspected Mods:
\tDistant Horizons (distanthorizons)
\t\tIssue tracker URL: https://example
\tMinecraft (minecraft)

Stacktrace:
\tat x`);
    expect(c).toEqual({ description: 'Initializing game', suspects: ['distanthorizons'] });
    expect(
      logProblems(
        '[19:02:07] [Render thread/WARN]: Partially Incompatible Distant Horizons mod detected: [Chunky] Chunky can cause holes.\n[x] fine',
      ),
    ).toEqual([
      'Partially Incompatible Distant Horizons mod detected: [Chunky] Chunky can cause holes.',
    ]);
  });
});

describe('Modrinth projects for missing mods', () => {
  it('maps Fabric API parts and LibJF modules to their project', () => {
    expect(modrinthProjectFor('fabric-lifecycle-events-v1')).toBe('fabric-api');
    expect(modrinthProjectFor('fabric-api-base')).toBe('fabric-api');
    expect(modrinthProjectFor('libjf-config-core-v2')).toBe('libjf');
    expect(modrinthProjectFor('c2me-base')).toBe('c2me-fabric');
    expect(modrinthProjectFor('spruceui')).toBe('spruceui');
  });
});
