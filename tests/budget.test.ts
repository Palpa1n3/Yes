import { describe, expect, it } from 'vitest';
import { budgetBlock, taskCapReached } from '@shared/usage';

describe('the monthly Claude limit', () => {
  it('lets everything through below the limit, or with no limit', () => {
    expect(budgetBlock(5, 10, 'pause-all', 'chat')).toBeNull();
    expect(budgetBlock(50, 0, 'pause-all', 'agent')).toBeNull();
  });
  it('only warns when told to', () => {
    expect(budgetBlock(12, 10, 'warn', 'agent')).toBeNull();
  });
  it('pauses background work but keeps chat going', () => {
    expect(budgetBlock(10, 10, 'pause-background', 'agent')).toMatch(/background work/);
    expect(budgetBlock(10, 10, 'pause-background', 'research')).not.toBeNull();
    expect(budgetBlock(10, 10, 'pause-background', 'memory')).not.toBeNull();
    expect(budgetBlock(10, 10, 'pause-background', 'chat')).toBeNull();
  });
  it('pauses everything when told to', () => {
    expect(budgetBlock(11, 10, 'pause-all', 'chat')).toMatch(/isn’t using Claude/);
  });
  it('caps one Agent Mode task', () => {
    expect(taskCapReached(1.2, 1.3)).toBe(false);
    expect(taskCapReached(1.3, 1.3)).toBe(true);
    expect(taskCapReached(99, 0)).toBe(false);
  });
});
