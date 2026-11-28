import { describe, expect, it } from 'vitest';
import { priorStep, resumeTask } from '@shared/agent';

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
    expect(t).not.toMatch(/Irreversible/);
    expect(t).toMatch(/Look at the screen first/);
  });

  it('lists the irreversible steps already taken, and which may not have finished', () => {
    const t = resumeTask({
      task: 'Buy the PS5 and email Sam',
      step: 9,
      startedAt: 1,
      savedAt: 2,
      log: [],
      irreversible: [
        { text: 'Pressed “Place order”', button: 'Place order', at: 1, state: 'done' },
        { text: 'Send the email to Sam', at: 2, state: 'started' },
      ],
    });
    expect(t).toMatch(/NEVER repeat these/);
    expect(t).toMatch(/- Pressed “Place order”\n/);
    expect(t).toMatch(/- Send the email to Sam \(was starting when the task was cut off/);
  });

  it('matches a repeated step by its wording, or a button by its label', () => {
    const prior = [
      { text: 'Send the email to Sam about the party', at: 1, state: 'done' as const },
      { text: 'Pressed “Send”', button: 'Send', at: 2, state: 'done' as const },
    ];
    expect(priorStep(prior, { text: 'send the email to sam about the party' })?.at).toBe(1);
    expect(priorStep(prior, { text: 'Send an email to Sam about the party' })?.at).toBe(1);
    expect(priorStep(prior, { text: 'Delete the old photos' })).toBeNull();
    expect(priorStep(prior, { button: ' send ' })?.at).toBe(2);
    expect(priorStep(prior, { button: 'Pay now' })).toBeNull();
    expect(priorStep(undefined, { text: 'x' })).toBeNull();
  });
});
