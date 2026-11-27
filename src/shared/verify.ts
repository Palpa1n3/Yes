/** Checking a change after making it: what was asked for against what the PC reports now.
 *  Pure; tested in tests/verify.test.ts. */

/** The volume Windows reports after a change, against what was asked: why it differs, or null. */
export function volumeMismatch(
  asked: { level?: number; mute?: boolean },
  got: { level: number; muted: boolean },
): string | null {
  const parts: string[] = [];
  if (typeof asked.level === 'number' && Math.abs(Math.round(asked.level) - got.level) > 1)
    parts.push(`the volume is ${got.level}%, not ${Math.round(asked.level)}%`);
  if (typeof asked.mute === 'boolean' && asked.mute !== got.muted)
    parts.push(got.muted ? 'it is still muted' : 'it is not muted');
  return parts.length ? `Windows didn't take the change: ${parts.join(' and ')}.` : null;
}

export interface MoveCheck {
  from: string;
  to: string;
}

/** After moving files: which really arrived (at `to`, gone from `from`). */
export function movesLanded<T extends MoveCheck>(
  moves: T[],
  exists: (p: string) => boolean,
): { landed: T[]; missing: T[] } {
  const landed: T[] = [];
  const missing: T[] = [];
  for (const m of moves) (exists(m.to) && !exists(m.from) ? landed : missing).push(m);
  return { landed, missing };
}

/** A line for a change that didn't (fully) stick, for the action history. */
export const notStuck = (what: string, detail: string): string =>
  `Checked after: ${what} didn't fully take effect. ${detail}`;
