import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { addUsage, budgetCrossed, costOf, fmtUsd, summarise } from '@shared/usage';
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
    expect(fmtUsd(0.004)).toBe('under 1¢');
    expect(fmtUsd(1.234)).toBe('$1.23');
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
