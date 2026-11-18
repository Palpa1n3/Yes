import { describe, expect, it } from 'vitest';
import { untilText } from '@renderer/components/panels/AgendaPanel';

describe('agenda countdown', () => {
  it('reads naturally', () => {
    expect(untilText(25 * 60_000)).toBe('in 25 min');
    expect(untilText(10_000)).toBe('in 1 min');
    expect(untilText(125 * 60_000)).toBe('in 2h 05m');
    expect(untilText(50 * 3600_000)).toBe('in 2 days');
  });
});
