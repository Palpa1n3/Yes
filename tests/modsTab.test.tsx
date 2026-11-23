import { render, screen } from '@testing-library/react';
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
