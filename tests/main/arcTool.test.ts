import { describe, expect, it } from 'vitest';
import { toIntent } from '../../src/main/services/anthropic-provider';

describe('control_arc tool', () => {
  it('is offered to Claude as control_arc', () => {
    expect(toIntent('control_arc', { action: 'open_tab', value: 'notes' })).toEqual({
      intent: { action: 'arc_control', target: 'open_tab', args: ['notes'] },
    });
    expect(toIntent('control_arc', { action: 'format_c' })).toHaveProperty('error');
  });
});
