import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcAPI, McReport } from '@shared/ipc';
import { MinecraftTab } from '@renderer/components/tabs/MinecraftTab';
import { installArcMock } from './arcMock';

let arc: ArcAPI;
beforeEach(() => {
  arc = installArcMock();
});

const profile = {
  id: 'lunar:26:26.3',
  name: 'Minecraft 26 (26.3)',
  launcher: 'Lunar Client' as const,
  gameVersion: '26.3',
  loader: 'fabric',
  modsDir: 'C:\\x',
  mods: 127,
  current: true,
};
const report: McReport = {
  profile,
  mods: [
    {
      file: 'Chunky-Fabric-1.5.66.jar',
      enabled: true,
      id: 'chunky',
      name: 'Chunky',
      version: '1.5.66',
      depends: {},
      breaks: {},
      provides: [],
      library: false,
    },
  ],
  problems: [
    {
      kind: 'duplicate',
      file: 'JustMobHeads-8.8.jar',
      modId: 'justmobheads',
      text: 'Just Mob Heads is installed twice (8.9 and 8.8); 8.8 is the older copy.',
    },
    {
      kind: 'missing',
      file: 'c2me.jar',
      modId: 'c2me',
      needs: 'c2me-base',
      text: 'Concurrent Chunk Management Engine needs “c2me-base”, which isn’t installed.',
    },
  ],
  log: [],
  crash: null,
  updates: [
    {
      file: 'fabric-api-0.166.2+26.3.jar',
      modId: 'fabric-api',
      name: 'Fabric API',
      from: '0.166.2',
      to: '0.167.0',
      url: 'https://cdn.modrinth.com/x.jar',
      filename: 'fabric-api-0.167.0+26.3.jar',
      sha1: 'abc',
    },
  ],
  error: '',
};

describe('Minecraft tab', () => {
  it('shows profiles, problems and updates, and fixes on request', async () => {
    vi.mocked(arc.minecraft.profiles).mockResolvedValue([profile]);
    vi.mocked(arc.minecraft.scan).mockResolvedValue(report);
    vi.mocked(arc.minecraft.checkUpdates).mockResolvedValue(report);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MinecraftTab />);
    expect(await screen.findByText(/Minecraft 26 \(26\.3\) · selected in Lunar/)).toBeTruthy();
    expect(await screen.findByText(/Just Mob Heads is installed twice/)).toBeTruthy();
    expect(screen.getByText('Fabric API: 0.166.2 → 0.167.0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fix my mods \(2\)/ }));
    expect(arc.minecraft.fixAll).toHaveBeenCalledWith('lunar:26:26.3');
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));
    expect(arc.minecraft.addMissing).toHaveBeenCalledWith('lunar:26:26.3', 'c2me-base');
  });
});
