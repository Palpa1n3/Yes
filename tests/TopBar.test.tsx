import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ArcAPI } from '@shared/ipc';
import { TopBar } from '@renderer/components/hud/TopBar';
import { useUiStore } from '@renderer/stores/uiStore';
import { installArcMock } from './arcMock';

let arc: ArcAPI;
beforeEach(() => {
  arc = installArcMock();
  useUiStore.setState({ tab: 'overview' });
});

describe('TopBar', () => {
  it('renders the configured assistant name, not a hard-coded one', () => {
    render(<TopBar assistantName="FRIDAY-ish" maximized={false} />);
    expect(screen.getByText('FRIDAY-ish')).toBeTruthy();
  });

  it('wires window controls to the bridge', () => {
    render(<TopBar assistantName="ARC" maximized={false} />);
    fireEvent.click(screen.getByLabelText('Minimise'));
    fireEvent.click(screen.getByLabelText('Maximise'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(arc.window.minimize).toHaveBeenCalledOnce();
    expect(arc.window.toggleMaximize).toHaveBeenCalledOnce();
    expect(arc.window.close).toHaveBeenCalledOnce();
  });

  it('shows Restore when maximised', () => {
    render(<TopBar assistantName="ARC" maximized />);
    expect(screen.getByLabelText('Restore')).toBeTruthy();
  });

  it('shows the current section, opens the sections list, and keeps Ctrl+number', () => {
    render(<TopBar assistantName="ARC" maximized={false} />);
    fireEvent.click(screen.getByLabelText(/Section: Overview/));
    expect(useUiStore.getState().settingsOpen).toBe(true);
    expect(useUiStore.getState().settingsTab).toBe('sections');
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(useUiStore.getState().tab).toBe('chat');
    fireEvent.keyDown(window, { key: '4', ctrlKey: true });
    expect(useUiStore.getState().tab).toBe('system');
    expect(screen.getByLabelText(/Section: System/)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
