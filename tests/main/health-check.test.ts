import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/types';
import { healthVerdict } from '@shared/update-health';
import { KEY_CHANNELS, runHealthChecks } from '../../src/main/services/health-check';

const deps = (userData: string, over: Partial<Parameters<typeof runHealthChecks>[0]> = {}) => ({
  userData,
  settings: () => DEFAULT_SETTINGS,
  handled: () => new Set(KEY_CHANNELS),
  window: () => ({ alive: true, crashed: false, url: 'file:///index.html' }),
  encryption: async () => true,
  unlocks: async () => true,
  recentErrors: () => 0,
  ...over,
});

describe('start-up health checks on the real app parts', () => {
  it('passes a healthy start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-health-'));
    writeFileSync(join(dir, 'settings.json'), '{}');
    mkdirSync(join(dir, 'chats'));
    writeFileSync(join(dir, 'chats', 'a.json'), '{"id":"a"}');
    writeFileSync(join(dir, 'anthropic-key.bin'), 'x');
    const checks = await runHealthChecks(
      deps(dir, { phoneLink: () => ({ wanted: true, running: true, error: null }) }),
    );
    expect(checks.map((x) => [x.id, x.ok])).toEqual([
      ['data', true],
      ['settings', true],
      ['ipc', true],
      ['window', true],
      ['encryption', true],
      ['secrets', true],
      ['phone', true],
      ['errors', true],
    ]);
    expect(healthVerdict(checks, '1.0.0').ok).toBe(true);
  });

  it('fails on damaged data, missing links, a crashed window or broken encryption', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-health-'));
    mkdirSync(join(dir, 'chats'));
    writeFileSync(join(dir, 'chats', 'b.json'), '{"id":');
    const checks = await runHealthChecks(
      deps(dir, {
        handled: () => new Set(KEY_CHANNELS.slice(1)),
        window: () => ({ alive: true, crashed: true, url: 'x' }),
        encryption: async () => false,
      }),
    );
    const v = healthVerdict(checks, '1.0.1');
    expect(v.ok).toBe(false);
    expect(v.criticalFailed.map((x) => x.id)).toEqual(['data', 'ipc', 'window', 'encryption']);
    expect(v.text).toMatch(/can't read chats\/b\.json/);
    expect(v.text).toMatch(/missing settings:get/);
  });

  it('only warns about a key that won’t unlock, a phone link that’s down, or logged errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arc-health-'));
    writeFileSync(join(dir, 'email.bin'), 'x');
    const checks = await runHealthChecks(
      deps(dir, {
        unlocks: async () => false,
        phoneLink: () => ({ wanted: true, running: false, error: 'port in use' }),
        recentErrors: () => 2,
      }),
    );
    const v = healthVerdict(checks, '1.0.1');
    expect(v.ok).toBe(true);
    expect(v.minorFailed.map((x) => x.id)).toEqual(['secrets', 'phone', 'errors']);
    expect(v.text).toMatch(/can't unlock the email password/);
    // Phone link switched off: not checked at all.
    const off = await runHealthChecks(
      deps(dir, { phoneLink: () => ({ wanted: false, running: false, error: null }) }),
    );
    expect(off.some((x) => x.id === 'phone')).toBe(false);
  });
});
