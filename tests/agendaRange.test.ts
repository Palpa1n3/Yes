import { describe, expect, it } from 'vitest';
import { timeRange } from '@renderer/components/panels/AgendaPanel';
import { fmtTime } from '@shared/calendar';

describe('agenda end times', () => {
  it('shows start–end, with +1 when it ends the next day', () => {
    const a = new Date(2026, 10, 20, 8, 15).getTime();
    const b = new Date(2026, 10, 20, 16, 15).getTime();
    expect(timeRange({ title: 'x', start: a, end: b, allDay: false } as never)).toBe(
      `${fmtTime(a)}–${fmtTime(b)}`,
    );
    const n = new Date(2026, 10, 21, 6, 0).getTime();
    expect(timeRange({ title: 'x', start: a, end: n, allDay: false } as never)).toContain('+1');
    expect(timeRange({ title: 'x', start: a, end: a, allDay: false } as never)).toBe(fmtTime(a));
  });
});
