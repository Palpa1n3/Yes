import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgendaPanel } from '@renderer/components/panels/AgendaPanel';
import { useCalendarStore } from '@renderer/stores/calendarStore';
import { fmtTime } from '@shared/calendar';
import { installArcMock } from './arcMock';

describe('agenda panel', () => {
  beforeEach(() => installArcMock());
  it('shows when each event ends', () => {
    const now = new Date();
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0).getTime();
    const b = a + 2 * 3600_000;
    useCalendarStore.setState({
      configured: true,
      events: [{ id: '1', title: 'wills shifts', start: a, end: b, allDay: false }],
      error: null,
      loading: false,
    } as never);
    render(<AgendaPanel />);
    expect(screen.getByText(`${fmtTime(a)}–${fmtTime(b)} +1`)).toBeTruthy();
  });
});
