import { describe, expect, it } from 'vitest';
import { resumeTask } from '@shared/agent';

describe('carrying on an interrupted Agent Mode task', () => {
  it('keeps the task and says what was done', () => {
    const t = resumeTask({
      task: 'Rename the photos in Downloads by date',
      step: 3,
      startedAt: 1,
      savedAt: 2,
      log: [
        { at: 1, text: 'Task: Rename the photos in Downloads by date' },
        { at: 2, text: 'Opened File Explorer' },
        { at: 3, text: 'Renamed IMG_001 to 2026-11-01' },
      ],
    });
    expect(t.startsWith('Rename the photos in Downloads by date')).toBe(true);
    expect(t).toMatch(/after step 3/);
    expect(t).toMatch(/- Renamed IMG_001 to 2026-11-01/);
    expect(t).not.toMatch(/- Task:/);
    expect(t).toMatch(/Look at the screen first/);
  });
});
