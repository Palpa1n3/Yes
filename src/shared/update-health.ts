/** Health checks after each start (safety gate 3): not just "it opened", but the key parts
 *  working: saved data readable, settings loaded, the app's internal links (IPC) in place, the
 *  window alive, encrypted keys still unlockable, the phone link up when it's switched on. A
 *  critical failure means the start doesn't count as working, so two in a row after an update roll
 *  back to the version before. Pure; tested in tests/update-health.test.ts. */

export interface HealthCheck {
  id: string;
  /** What was checked, in plain words. */
  label: string;
  ok: boolean;
  /** A failure here means this version isn't working properly. */
  critical: boolean;
  detail?: string;
}

export interface HealthVerdict {
  /** Every critical check passed (minor ones may still have failed). */
  ok: boolean;
  passed: number;
  total: number;
  criticalFailed: HealthCheck[];
  minorFailed: HealthCheck[];
  text: string;
}

export function healthVerdict(checks: HealthCheck[], version: string): HealthVerdict {
  const criticalFailed = checks.filter((c) => !c.ok && c.critical);
  const minorFailed = checks.filter((c) => !c.ok && !c.critical);
  const passed = checks.filter((c) => c.ok).length;
  const why = (cs: HealthCheck[]): string =>
    cs.map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ''}`).join('; ');
  const text = criticalFailed.length
    ? `Health check for ${version}: ${passed} of ${checks.length} passed. Not working: ${why(criticalFailed)}.${
        minorFailed.length ? ` Also: ${why(minorFailed)}.` : ''
      }`
    : minorFailed.length
      ? `Health check for ${version}: the key parts work; ${why(minorFailed)} didn't.`
      : `Health check for ${version}: all ${checks.length} checks passed.`;
  return {
    ok: !criticalFailed.length,
    passed,
    total: checks.length,
    criticalFailed,
    minorFailed,
    text,
  };
}

/** Does this text parse as JSON? (Saved data files.) */
export function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    return true;
  } catch {
    return false;
  }
}

/** Which of the channels the window needs have no handler in main. */
export function missingChannels(needed: string[], handled: Set<string>): string[] {
  return needed.filter((c) => !handled.has(c));
}

/** A failed health check on this start: roll back now, rather than waiting for another start?
 *  Yes when this version came from an update and this is its last allowed failing start
 *  (`failsBefore` is how many earlier starts of it already failed). */
export function rollBackNow(
  o: { from: string | null; failsBefore: number; rollingBackFrom?: string | null; version: string },
  verdict: HealthVerdict,
  failsAllowed: number,
): boolean {
  return (
    !verdict.ok && !!o.from && o.rollingBackFrom !== o.version && o.failsBefore + 1 >= failsAllowed
  );
}
