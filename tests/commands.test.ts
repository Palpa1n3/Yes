import { describe, expect, it } from 'vitest';
import { CANONICAL_ACTIONS, canonIntent, toCommand } from '@shared/commands';

/** canonIntent must map every variant an AI might produce onto one action, and never
 *  silently drop anything: unrecognised phrasing becomes `unknown` (reported to the user). */
describe('canonIntent', () => {
  const cases: Record<string, string[]> = {
    launch_app: [
      'open app',
      'Open Application',
      'launch',
      'LAUNCH_APP',
      'launch-app',
      'start',
      'start program',
      'run',
      'execute',
      'fire up',
      'open_app',
      '  open   app  ',
      'Launch App!',
    ],
    open_url: [
      'open url',
      'open website',
      'go to',
      'goto',
      'navigate to',
      'browse to',
      'visit',
      'open link',
      'open_url',
      'Open-Website',
    ],
    search_web: [
      'search',
      'web search',
      'search the web',
      'google',
      'look up',
      'lookup',
      'search for',
      'web_search',
      'Search Web',
    ],
    system_query: [
      'system status',
      'system info',
      'diagnostics',
      'check system',
      'health check',
      'system_query',
      'get_system_info',
    ],
  };
  for (const [action, phrases] of Object.entries(cases)) {
    it.each(phrases)(`"%s" → ${action}`, (p) => expect(canonIntent(p)).toBe(action));
  }

  it.each([
    '',
    '   ',
    'make me a sandwich',
    'delete everything',
    '🚀',
    'open',
    'launchpad',
    'systematic',
  ])('"%s" → unknown', (p) => expect(canonIntent(p)).toBe('unknown'));

  it('only ever returns a known canonical action', () => {
    const noise = ['xyz', 'OPEN APP', 'search', 'launch_app', 'goto', 'abc def', '123'];
    for (const n of noise) expect(CANONICAL_ACTIONS).toContain(canonIntent(n));
  });

  it('toCommand keeps the raw phrase and assigns risk', () => {
    expect(toCommand({ action: 'Fire Up', target: 'steam' }, 'x')).toEqual({
      id: 'x',
      action: 'launch_app',
      target: 'steam',
      risk: 'safe',
      rawAction: 'Fire Up',
    });
    expect(toCommand({ action: 'reticulate splines' }, 'y')).toMatchObject({
      action: 'unknown',
      risk: 'sensitive',
    });
  });
});
