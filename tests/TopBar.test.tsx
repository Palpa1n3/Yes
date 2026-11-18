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

  it('switches tabs by click, arrow keys and Ctrl+number', () => {
    render(<TopBar assistantName="ARC" maximized={false} />);
    fireEvent.click(screen.getByRole('tab', { name: /network/i }));
    expect(useUiStore.getState().tab).toBe('network');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(useUiStore.getState().tab).toBe('storage');
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(useUiStore.getState().tab).toBe('chat');
    fireEvent.keyDown(window, { key: '4', ctrlKey: true });
    expect(useUiStore.getState().tab).toBe('system');
    expect(screen.getByRole('tab', { name: /system/i }).getAttribute('aria-selected')).toBe('true');
  });
});
