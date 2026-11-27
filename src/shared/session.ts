/** Noticing that Alton didn't close properly last time (a power cut, Windows crashing, or Alton
 *  itself crashing), and what was interrupted. Pure; tested in tests/session.test.ts. */

/** userData/session.json, rewritten while Alton runs. */
export interface SessionRecord {
  /** Alton quit properly (or Windows was shut down normally). */
  clean: boolean;
  startedAt: number;
  /** Last heartbeat (every 30 s). */
  lastAlive: number;
  version: string;
  /** Work in progress, so it can be named (and picked up) after a bad shutdown. */
  work: {
    agent?: { task: string; step: number; at: number } | null;
    research?: string[];
  };
}

export interface RecoveryReport {
  /** 'pc': the computer itself went off or restarted; 'alton': Alton stopped, Windows kept going. */
  kind: 'pc' | 'alton';
  /** About when it happened (the last heartbeat). */
  at: number;
  agent: { task: string; step: number } | null;
  research: string[];
}

/** What the last session left behind. `bootedAt`: when Windows last started (now − uptime). */
export function lastSessionReport(
  prev: SessionRecord | null,
  bootedAt: number,
): RecoveryReport | null {
  if (!prev || prev.clean) return null;
  return {
    // Windows started after Alton's last heartbeat: the PC went down, not just Alton.
    kind: bootedAt > prev.lastAlive ? 'pc' : 'alton',
    at: prev.lastAlive,
    agent: prev.work.agent ? { task: prev.work.agent.task, step: prev.work.agent.step } : null,
    research: prev.work.research ?? [],
  };
}

/** The message shown after a bad shutdown. */
export function describeRecovery(r: RecoveryReport, time: (ms: number) => string): string {
  const what =
    r.kind === 'pc'
      ? `The PC went off or restarted unexpectedly (around ${time(r.at)}), so Alton didn't close properly.`
      : `Alton stopped unexpectedly last time (around ${time(r.at)}).`;
  const lost: string[] = [];
  if (r.agent) lost.push(`Agent Mode was on step ${r.agent.step} of “${r.agent.task}”`);
  if (r.research.length)
    lost.push(`background research on ${r.research.map((t) => `“${t}”`).join(', ')} didn't finish`);
  const tail = lost.length
    ? ` Interrupted: ${lost.join('; ')}. Ask me to start ${lost.length === 1 ? 'it' : 'them'} again if you still need ${lost.length === 1 ? 'it' : 'them'}.`
    : ' Nothing was running, and your data was checked at start-up.';
  return `${what}${tail}`;
}
