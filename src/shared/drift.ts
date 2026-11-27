/** Noticing changes nobody asked for: a sudden big drop or jump in what's installed in the game
 *  folder (e.g. Vortex switching to an empty profile and taking every mod out). Pure; tested in
 *  tests/drift.test.ts. */

/** How many of each kind of mod file are in the game folder. */
export interface Footprint {
  archives: number;
  scripts: number;
  tweaks: number;
  plugins: number;
  cet: number;
}

export const FOOTPRINT_LABEL: Record<keyof Footprint, string> = {
  archives: 'archive mods',
  scripts: 'script mods',
  tweaks: 'tweaks',
  plugins: 'RED4ext plugins',
  cet: 'Cyber Engine Tweaks mods',
};

/** Big changes between two counts: at least `minCount` items and at least `share` of them. */
export function footprintDrift(
  before: Footprint,
  after: Footprint,
  minCount = 15,
  share = 0.25,
): Array<{ kind: keyof Footprint; before: number; after: number }> {
  const out: Array<{ kind: keyof Footprint; before: number; after: number }> = [];
  for (const kind of Object.keys(FOOTPRINT_LABEL) as Array<keyof Footprint>) {
    const a = before[kind] ?? 0;
    const b = after[kind] ?? 0;
    const diff = Math.abs(b - a);
    if (diff >= minCount && diff >= Math.max(a, b) * share) out.push({ kind, before: a, after: b });
  }
  return out;
}

/** The warning for changes nobody (that Alton knows of) made. */
export function describeDrift(
  changes: Array<{ kind: keyof Footprint; before: number; after: number }>,
): string {
  const parts = changes.map((c) => `${FOOTPRINT_LABEL[c.kind]} ${c.before} → ${c.after}`);
  const drop = changes.some((c) => c.after < c.before);
  return `Your Cyberpunk mods changed a lot without Alton doing it: ${parts.join(', ')}. ${
    drop
      ? 'If you didn’t mean this, check Vortex is on your usual profile, then press Deploy (or Mods › Vortex › Sync now).'
      : 'If you didn’t install these, check Vortex.'
  }`;
}
