import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  addUsage,
  budgetCrossed,
  budgetFromGbp,
  budgetInGbp,
  costOf,
  fmtUsd,
  summarise,
} from '@shared/usage';
import { UsageTracker } from '../../src/main/services/usage-tracker';

describe('spending estimates', () => {
  it('prices requests per model, with caching and web searches', () => {
    // Sonnet 5.5: $2 in / $10 out per million.
    expect(
      costOf('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 }),
    ).toBeCloseTo(3);
    // Opus 5.5: $4 / $20; cache reads $0.20.
    expect(
      costOf('claude-opus-5-5', {
        input_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        output_tokens: 0,
      }),
    ).toBeCloseTo(0.2);
    // Haiku 5.5: $0.10 / $0.50 under 100K prompt tokens, $0.50 / $2.50 above.
    expect(costOf('claude-haiku-5-5', { input_tokens: 50_000, output_tokens: 0 })).toBeCloseTo(
      0.005,
    );
    expect(costOf('claude-haiku-5-5', { input_tokens: 200_000, output_tokens: 0 })).toBeCloseTo(
      0.1,
    );
    // Web search $0.01 each; cache writes 1.25x input.
    expect(
      costOf('claude-sonnet-5-5', {
        input_tokens: 0,
        output_tokens: 0,
        server_tool_use: { web_search_requests: 3 },
      }),
    ).toBeCloseTo(0.03);
    expect(costOf('claude-sonnet-5-5', { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(
      2.5,
    );
  });

  it('adds up days, months and features', () => {
    let days = addUsage([], 0.5, 'chat', new Date(2026, 10, 18, 9));
    days = addUsage(days, 0.25, 'research', new Date(2026, 10, 19, 9));
    days = addUsage(days, 0.25, 'chat', new Date(2026, 10, 19, 10));
    days = addUsage(days, 9, 'chat', new Date(2026, 9, 30, 10)); // last month
    const s = summarise(days, 5, new Date(2026, 10, 19, 12));
    expect(s.today).toBeCloseTo(0.5);
    expect(s.month).toBeCloseTo(1);
    expect(s.byFeature).toEqual({ chat: 0.75, research: 0.25 });
    expect(fmtUsd(0.004)).toBe('under 1p');
    expect(fmtUsd(1.234)).toBe('£0.94');
    expect(fmtUsd(100)).toBe('£76');
    expect(budgetInGbp(budgetFromGbp(5))).toBe(5);
  });

  it('warns once at 80% and once at 100% of the limit', () => {
    expect(budgetCrossed(3, 4.1, 5)).toBe(80);
    expect(budgetCrossed(4.1, 4.5, 5)).toBeNull();
    expect(budgetCrossed(4.5, 5.2, 5)).toBe(100);
    expect(budgetCrossed(1, 100, 0)).toBeNull();
    const warn = vi.fn();
    const t = new UsageTracker({
      file: join(mkdtempSync(join(tmpdir(), 'arc-use-')), 'usage.json'),
      budget: () => 1,
      warn,
    });
    t.record('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 90_000 }, 'chat'); // $0.90
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/80%/));
    t.record('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 20_000 }, 'agent'); // $1.10
    expect(warn).toHaveBeenLastCalledWith(expect.stringMatching(/reached/));
    expect(t.summary().byFeature.agent).toBeCloseTo(0.2);
  });
});

describe('one spending limit for the PC and the phone (tracker)', () => {
  it('counts the phone’s costs in the total and the limit, and keeps them after a restart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'arc-usage-')), 'usage.json');
    const now = () => new Date(2026, 10, 28, 12);
    const warn = vi.fn();
    const t = new UsageTracker({ file, budget: () => 1, action: () => 'pause-all', warn, now });
    expect(t.blocked('chat')).toBeNull();
    t.setPhoneDays([{ day: '2026-11-28', usd: 1.2, requests: 4, by: { chat: 1.2 } }]);
    expect(t.summary().month).toBeCloseTo(1.2);
    expect(t.summary().byFeature.phone).toBeCloseTo(1.2);
    expect(t.blocked('chat')).toMatch(/limit/);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/counting the phone/));
    expect(t.shared()).toEqual({ month: 1.2, budget: 1, action: 'pause-all' });
    // Sending the same days again replaces them, never doubles them.
    t.setPhoneDays([{ day: '2026-11-28', usd: 1.2, requests: 4, by: {} }]);
    expect(t.summary().month).toBeCloseTo(1.2);
    // Junk from the phone is ignored.
    t.setPhoneDays([{ day: '2026-11-28', usd: -5 }, { day: 3, usd: 'x' }, null]);
    expect(t.summary().month).toBe(0);
    t.setPhoneDays([{ day: '2026-11-28', usd: 0.4, requests: 1, by: {} }]);
    const again = new UsageTracker({ file, budget: () => 1, now });
    expect(again.summary().month).toBeCloseTo(0.4);
  });
});
