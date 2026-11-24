import { describe, expect, it } from 'vitest';
import { missingDeps, parseRequirements } from '@shared/cpdeps';
import { sameDownloadCopies } from '@shared/vortex';

describe('Cyberpunk mod dependencies', () => {
  const reqs = parseRequirements({
    data: {
      legacyModsByDomain: {
        nodes: [
          {
            modId: 4591,
            name: 'RadioExt',
            modRequirements: {
              nexusRequirements: {
                nodes: [
                  {
                    modId: '107',
                    gameId: '3333',
                    modName: 'Cyber Engine Tweaks',
                    externalRequirement: false,
                  },
                  { modId: '2380', gameId: '3333', modName: 'RED4ext', externalRequirement: false },
                  { modId: '9', gameId: '3333', modName: 'Outside', externalRequirement: true },
                ],
              },
            },
          },
          {
            modId: 21481,
            name: 'Virtual Atelier',
            modRequirements: {
              nexusRequirements: {
                nodes: [
                  {
                    modId: '21482',
                    gameId: '3333',
                    modName: 'VA Delivery',
                    externalRequirement: false,
                  },
                ],
              },
            },
          },
          {
            modId: 5,
            name: 'Saved one',
            modRequirements: {
              nexusRequirements: {
                nodes: [{ modId: '77', gameId: '3333', modName: 'X', externalRequirement: false }],
              },
            },
          },
        ],
      },
    },
  });
  it('reads the Nexus answer', () => {
    expect(reqs).toHaveLength(3);
    expect(reqs[0]?.requires[0]).toEqual({
      modId: '107',
      gameId: '3333',
      modName: 'Cyber Engine Tweaks',
      externalRequirement: false,
    });
    expect(parseRequirements(null)).toEqual([]);
  });
  it('lists only what is missing', () => {
    const d = missingDeps(new Set([4591, 107, 21481, 5, 2380]), new Set([2380, 5]), reqs);
    expect(d).toEqual([
      { modId: 2380, name: 'RED4ext', neededBy: ['RadioExt'], saved: true },
      { modId: 21482, name: 'VA Delivery', neededBy: ['Virtual Atelier'], saved: false },
    ]);
  });
});

describe('same-download copies in Vortex', () => {
  it('keeps the copies that are on, else the newest', () => {
    expect(
      sameDownloadCopies([
        { id: 'a-new', archiveId: 'A', variant: '', enabled: true, installedAt: 9 },
        { id: 'a-old', archiveId: 'A', variant: '', enabled: false, installedAt: 1 },
        { id: 'a-var', archiveId: 'A', variant: 'v2', enabled: false, installedAt: 1 },
        { id: 'b1', archiveId: 'B', variant: '', enabled: false, installedAt: 1 },
        { id: 'b2', archiveId: 'B', variant: '', enabled: false, installedAt: 5 },
        { id: 'c', archiveId: '', variant: '', enabled: false, installedAt: 5 },
      ]),
    ).toEqual(['a-old', 'b1']);
  });
});
