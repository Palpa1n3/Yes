/** Helping speech recognition with your voice: a vocabulary hint for Whisper (your words and
 *  app names), corrections learnt from voice training ("necklion" → "Lunar Client"), and a
 *  safety net for "open X" when X is close to an installed app. Pure, tested. */

export interface VoiceFix {
  /** What the speech model wrote. */
  heard: string;
  /** What you said. */
  meant: string;
}

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Installed app names worth hinting: no uninstallers, help files or very long names. */
export function cleanAppNames(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const t = n.trim();
    if (!t || t.length > 32) continue;
    if (
      /uninstall|readme|help|documentation|release notes|license|website|manual|setup|updater|crash/i.test(
        t,
      )
    )
      continue;
    out.add(t);
  }
  return [...out];
}

/** The hint given to Whisper before it listens: names and words to spell like this.
 *  Your own words and learnt fixes first (they matter most), then app names. Kept short. */
export function voicePrompt(
  assistant: string,
  words: string[],
  fixes: VoiceFix[],
  apps: string[],
): string {
  const all: string[] = [];
  const seen = new Set<string>();
  for (const w of [assistant, ...words, ...fixes.map((f) => f.meant), ...apps]) {
    const k = w.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    all.push(w.trim());
  }
  let out = '';
  for (const w of all) {
    if ((out + w).length > 600) break;
    out += (out ? ', ' : '') + w;
  }
  return out ? `${out}.` : '';
}

/** From one training sentence, the part that came out wrong (common words at the start and
 *  end are trimmed). null when it was heard right or the difference is too big to be useful. */
export function learnFix(heard: string, meant: string): VoiceFix | null {
  const h = norm(heard).split(' ').filter(Boolean);
  const m = norm(meant).split(' ').filter(Boolean);
  if (!h.length || !m.length || h.join(' ') === m.join(' ')) return null;
  let a = 0;
  while (a < h.length && a < m.length && h[a] === m[a]) a++;
  let b = 0;
  while (b < h.length - a && b < m.length - a && h[h.length - 1 - b] === m[m.length - 1 - b]) b++;
  const hs = h.slice(a, h.length - b).join(' ');
  const ms = meant
    .trim()
    .split(/\s+/)
    .slice(a, m.length - b)
    .join(' ')
    .replace(/[.!?,]+$/, '');
  if (!hs || !ms || hs.split(' ').length > 6 || ms.split(' ').length > 6) return null;
  return { heard: hs, meant: ms };
}

/** Add a fix (newest wins; at most 100). */
export function addFix(fixes: VoiceFix[], f: VoiceFix): VoiceFix[] {
  return [f, ...fixes.filter((x) => norm(x.heard) !== norm(f.heard))].slice(0, 100);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Put learnt fixes into a transcript (longest first, whole words, any case). */
export function applyFixes(text: string, fixes: VoiceFix[]): string {
  let out = text;
  for (const f of [...fixes].sort((x, y) => y.heard.length - x.heard.length)) {
    const words = norm(f.heard).split(' ').map(escapeRe).join("[\\s,.'-]+");
    if (!words) continue;
    out = out.replace(new RegExp(`\\b${words}\\b`, 'gi'), f.meant);
  }
  return out;
}

function lev(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

/** "open loonar klient" → "open Lunar Client" when it's close to an installed app's name. */
export function fixAppCommand(text: string, apps: string[]): string {
  const m =
    /^(\s*(?:\w+,?\s+)?(?:open|launch|start|close|quit|run)\s+(?:up\s+)?)(.+?)([.!?]*)$/i.exec(
      text,
    );
  if (!m) return text;
  const said = norm(m[2] ?? '').replace(/ /g, '');
  if (said.length < 3) return text;
  let best: { name: string; d: number } | null = null;
  for (const a of apps) {
    const k = norm(a).replace(/ /g, '');
    if (!k) continue;
    if (k === said) return text;
    const d = lev(said, k) / Math.max(said.length, k.length);
    if (!best || d < best.d) best = { name: a, d };
  }
  return best && best.d <= 0.3 ? `${m[1]}${best.name}${m[3] ?? ''}` : text;
}
