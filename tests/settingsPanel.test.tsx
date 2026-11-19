import { act, render, screen } from '@testing-library/react';
import { it } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/types';
import { SettingsPanel } from '@renderer/components/settings/SettingsPanel';
import { useSettingsStore } from '@renderer/stores/settingsStore';
import { SETTINGS_TABS, useUiStore } from '@renderer/stores/uiStore';
import { installArcMock } from './arcMock';

it('every settings page renders and unmounts', async () => {
  installArcMock();
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS } });
  act(() => useUiStore.getState().openSettings('general'));
  render(<SettingsPanel />);
  for (const t of SETTINGS_TABS) {
    await act(async () => {
      useUiStore.getState().setSettingsTab(t);
      await new Promise((r) => setTimeout(r, 20));
    });
    screen.getByRole('dialog');
  }
});
