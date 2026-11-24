import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcAPI, ModsStatus } from '@shared/ipc';
import { ModsTab } from '@renderer/components/tabs/ModsTab';
import { installArcMock } from './arcMock';

let arc: ArcAPI;
beforeEach(() => {
  arc = installArcMock();
});

const status = (over: Partial<ModsStatus>): ModsStatus => ({
  game: 'C:\\Games\\Cyberpunk 2077',
  vortex: 'C:\\Vortex\\mods',
  mods: 440,
  files: { archives: 527, cet: 90, redscript: 225, tweaks: 146, red4ext: 16 },
  keySet: true,
  account: { name: 'V', premium: true },
  checking: null,
  lastCheck: Date.now() - 60_000,
  updates: [],
  updating: null,
  jobs: [],
  dailyLeft: 2400,
  error: '',
  ...over,
});

describe('Mods tab update progress', () => {
  it('shows how far Update all has got and each mod’s state', async () => {
    vi.mocked(arc.mods.status).mockResolvedValue(
      status({
        updates: [
          {
            modId: 1,
            name: 'Apartment Cats',
            installed: '2.2',
            latest: '2.3',
            updatedAt: 0,
            state: 'in-vortex',
            error: '',
          },
          {
            modId: 2,
            name: 'ACU',
            installed: '3.2',
            latest: '3.3',
            updatedAt: 0,
            state: 'queued',
            error: '',
          },
          {
            modId: 3,
            name: 'Radio',
            installed: '1',
            latest: '2',
            updatedAt: 0,
            state: 'failed',
            error: 'rate limit',
          },
        ],
        updating: { total: 140, done: 12, current: 'ACU' },
        jobs: [
          { modId: 1, name: 'Apartment Cats', state: 'in-vortex', at: 0, error: '' },
          { modId: 2, name: 'ACU', state: 'queued', at: 0, error: '' },
          { modId: 4, name: 'Black Lace Fix', state: 'installed', at: 0, error: '' },
        ],
      }),
    );
    render(<ModsTab />);
    expect(await screen.findByText(/Sending 12 of 140: ACU/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('9');
    expect(screen.getByText(/1 waiting · 1 in Vortex · 1 installed ✓/)).toBeTruthy();
    expect(screen.getByText('In Vortex: downloading and installing…')).toBeTruthy();
    expect(screen.getByText('Waiting its turn')).toBeTruthy();
    expect(screen.getByText(/Failed: rate limit/)).toBeTruthy();
    expect(screen.getByText('✓ Black Lace Fix')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
  });
});

describe('Mods tab load order', () => {
  it('shows clashes, the REDmod problem, and lets you pick a winner', async () => {
    vi.mocked(arc.mods.status).mockResolvedValue(status({}));
    vi.mocked(arc.mods.loadOrder).mockResolvedValue({
      archives: 320,
      modlist: 'none',
      conflicts: [
        {
          winner: '#ReallyWantToStayAtYourHouse_Judy.archive',
          loser: '#ReallyWantToStayAtYourHouse_Panam.archive',
          files: 20,
          variants: true,
          winnerMod: 'Really Want To Stay',
          loserMod: 'Really Want To Stay',
        },
      ],
      moves: [],
      redmod: {
        failed: true,
        stage: 'Script Compilation',
        error: 'Script compilation has failed!',
        scriptMods: ['NCPD Prevention Police Enhancement'],
        mods: [],
        verdict: 'REDmod’s last deploy failed at “Script Compilation”.',
      },
      error: '',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ModsTab />);
    fireEvent.click(await screen.findByRole('button', { name: /Check load order/ }));
    expect(
      await screen.findByText(/320 archives · name order · 1 clash · 1 between alternative/),
    ).toBeTruthy();
    expect(screen.getByText(/REDmod’s last deploy failed/)).toBeTruthy();
    expect(screen.getByText(/alternative versions: usually install just one/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make it win' }));
    expect(arc.mods.setOrder).toHaveBeenCalledWith({
      kind: 'prefer',
      archive: '#ReallyWantToStayAtYourHouse_Panam.archive',
      over: '#ReallyWantToStayAtYourHouse_Judy.archive',
    });
  });
});

describe('Mods tab fixes', () => {
  it('fixes on request, lists the fix and can undo it', async () => {
    vi.mocked(arc.mods.status).mockResolvedValue(status({}));
    vi.mocked(arc.mods.diagnose).mockResolvedValue({
      runs: [],
      gameVersion: '2.50',
      patchSeen: 0,
      lastGood: 0,
      culprit: null,
      outdated: [],
      scriptErrors: [],
      verdict: 'The last launch got past loading the mod plugins.',
      vortexMod: null,
      redmod: null,
      crash: null,
    });
    const fix = {
      id: 'f1',
      at: Date.now(),
      action: { kind: 'ignore-plugin' as const, plugin: 'RadioExt', mod: 'RadioExt 2.81' },
      note: 'Switched off the RadioExt plugin (from RadioExt 2.81), which crashed the game on start-up.',
      undone: false,
    };
    vi.mocked(arc.mods.autofix).mockResolvedValue({
      message: `${fix.note} Try starting the game again.`,
      state: { auto: true, fixing: false, fixes: [fix] },
    });
    render(<ModsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fix it for me' }));
    expect(await screen.findByText(/Try starting the game again/)).toBeTruthy();
    expect(
      screen.getByText(
        /Switched off the RadioExt plugin \(from RadioExt 2\.81\), which crashed the game on start-up\.$/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(arc.mods.undoFix).toHaveBeenCalledWith('f1');
    fireEvent.click(screen.getByRole('checkbox', { name: /Fix launch problems by itself/ }));
    expect(arc.mods.setAutoFix).toHaveBeenCalledWith(false);
  });
});

describe('Mods tab outdated mods', () => {
  it('lists outdated mods with reasons, removes them all and puts one back', async () => {
    vi.mocked(arc.mods.status).mockResolvedValue(status({}));
    vi.mocked(arc.mods.outdated).mockResolvedValue({
      mods: [
        {
          folder: 'Boomerang-1',
          name: 'Ranger Combat Boomerang',
          modId: 1,
          reasons: ['TweakXL rejects its change to Items.Misoru_BoomerangWraithWeaponModAbility.'],
          hasUpdate: false,
        },
        {
          folder: 'NCPD-2',
          name: 'NCPDPPE V2.7 ARCADE',
          modId: 9863,
          reasons: ['Its REDmod scripts stop REDmod’s script compile.'],
          hasUpdate: true,
        },
      ],
      removed: [{ folder: 'Old-3', name: 'Old Mod', files: 4, at: 0 }],
      gameVersion: '2.50',
      error: '',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ModsTab />);
    fireEvent.click(await screen.findByRole('button', { name: /Find outdated mods/ }));
    expect(await screen.findByText('Ranger Combat Boomerang')).toBeTruthy();
    expect(screen.getByText(/TweakXL rejects its change/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update instead' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(arc.mods.remove).toHaveBeenCalledWith(['Boomerang-1', 'NCPD-2']);
    fireEvent.click(await screen.findByRole('button', { name: 'Put back' }));
    expect(arc.mods.restore).toHaveBeenCalledWith(['Old-3']);
  });
});
