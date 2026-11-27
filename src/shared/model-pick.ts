/** Picking the Claude model for each message: the cheap, fast one for everyday requests, a
 *  stronger one (up to the user's chosen ceiling) when the message needs more thought. Pure;
 *  tested in tests/model-pick.test.ts. */
import type { AiModel } from './types';

export const FAST_MODEL: AiModel = 'claude-haiku-5-5';

const HARD: RegExp[] = [
  /\b(plan|design|architect\w*|strategy|compare|comparison|pros and cons|trade-?offs?)\b/i,
  /\b(analy[sz]e|analysis|evaluate|assess|review)\b/i,
  /\b(debug|refactor|stack ?trace|exception|traceback|segfault|compile error|why (does|is|did|won't|doesn't)|root cause)\b/i,
  /\bexplain (how|why|in detail)\b|\bstep[- ]by[- ]step\b/i,
  /\bwrite (me )?(a|an) (essay|report|cover letter|letter|story|speech|proposal|cv|resume|article)\b/i,
  /\b(proofread|rewrite|summari[sz]e this|translate this)\b/i,
];
const EASY =
  /^(what('s| is) the (time|date|weather)|set (a )?timer|remind me|play|pause|skip|next song|volume|open|close|launch|lock|mute|unmute|turn (on|off)|thanks|thank you|ok|cheers|hi|hello)\b/i;

/** How much thought a message needs (0 = trivial). */
export function complexity(text: string, attachments: Array<{ kind: string }> = []): number {
  const t = text.trim();
  let score = 0;
  if (t.length > 600) score += 2;
  else if (t.length > 250) score += 1;
  if (/```|^\s{4}\S|\bat [\w.$]+\(.*:\d+\)|Error: /m.test(t)) score += 2;
  for (const re of HARD) if (re.test(t)) score += 3;
  if ((t.match(/\?/g) ?? []).length >= 3) score += 1;
  for (const a of attachments) score += a.kind === 'pdf' ? 2 : a.kind === 'image' ? 1 : 1;
  if (EASY.test(t) && t.length < 120) score -= 3;
  return Math.max(0, score);
}

/** The score from which a message goes to the stronger model. */
export const NEEDS_MORE = 3;

export function pickModel(o: {
  text: string;
  attachments?: Array<{ kind: string }>;
  /** The user's chosen model (used as is when automatic choice is off). */
  chosen: AiModel;
  auto: boolean;
  /** The most capable model automatic choice may use. */
  top: AiModel;
  saver: boolean;
}): { model: AiModel; why: string } {
  if (o.saver) return { model: FAST_MODEL, why: 'Saver mode' };
  if (!o.auto) return { model: o.chosen, why: 'your chosen model' };
  const score = complexity(o.text, o.attachments);
  return score >= NEEDS_MORE
    ? { model: o.top, why: `needs more thought (score ${score})` }
    : { model: FAST_MODEL, why: `everyday request (score ${score})` };
}
