import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ArcAPI } from '@shared/ipc';
import { DEFAULT_DESK, cleanDesk, type DeskSnapshot } from '@shared/desk';
import { DeskView } from '@renderer/components/hud/DesktopWidget';
import { installArcMock } from './arcMock';

let arc: ArcAPI;
beforeEach(() => {
  arc = installArcMock();
});

const now = Date.now();
const snap: DeskSnapshot = {
  look: { desk: DEFAULT_DESK, theme: 'arc-cyan' },
  assistant: 'listening',
  name: 'Alton',
  music: {
    title: 'Cornfield Chase',
    artist: 'Composer',
    app: 'Spotify',
    playing: true,
    position: 60,
    duration: 120,
    at: now,
    art: null,
  },
  shift: { title: 'Tesco', start: now + 3 * 3_600_000, end: now + 11 * 3_600_000 },
  payday: { date: new Date(now + 3 * 86_400_000).toISOString().slice(0, 10), net: 293 },
  weather: { temp: 8, unit: '°C', code: 61, isDay: true, label: 'Rain', next: 'rain now' },
  timers: [
    { id: 't1', label: 'Pasta', dueAt: now + 272_000, createdAt: now - 60_000, ringing: false },
  ],
  reminders: [],
  list: { name: 'Shopping', items: ['milk', 'bread'] },
  phone: { battery: 64, charging: false, unread: 2, payday: null, at: now },
  agentWaiting: false,
  warning: null,
};

describe('desktop widget', () => {
  it('shows every tile at Large, with live bits', () => {
    render(<DeskView snap={snap} stats={null} desk={DEFAULT_DESK} />);
    expect(screen.getByText('Listening…')).toBeTruthy();
    expect(screen.getByText('Cornfield Chase')).toBeTruthy();
    expect(screen.getByText(/Next shift in 3 h/)).toBeTruthy();
    expect(screen.getByText(/Payday in 3 days/)).toBeTruthy();
    expect(screen.getByText('rain now', { exact: false })).toBeTruthy();
    expect(screen.getByText('Pasta')).toBeTruthy();
    expect(screen.getByText('milk, bread')).toBeTruthy();
    expect(screen.getByText('2 unread')).toBeTruthy();
  });
  it('shows just the clock at Small and two tiles at Medium', () => {
    const { container, rerender } = render(
      <DeskView snap={snap} stats={null} desk={cleanDesk({ size: 'small' })} />,
    );
    expect(container.querySelectorAll('section')).toHaveLength(1);
    rerender(<DeskView snap={snap} stats={null} desk={cleanDesk({ size: 'medium' })} />);
    expect(container.querySelectorAll('section')).toHaveLength(3);
  });
  it('talks and controls music from its buttons (not in the Settings preview)', () => {
    const { rerender } = render(<DeskView snap={snap} stats={null} desk={DEFAULT_DESK} />);
    fireEvent.click(screen.getByLabelText('Pause'));
    expect(arc.desk.action).toHaveBeenCalledWith('play_pause');
    fireEvent.click(screen.getByText('Alton'));
    expect(arc.desk.action).toHaveBeenCalledWith('talk');
    rerender(<DeskView snap={snap} stats={null} desk={DEFAULT_DESK} preview />);
    fireEvent.click(screen.getByLabelText('Next'));
    expect(arc.desk.action).not.toHaveBeenCalledWith('next');
  });
});
