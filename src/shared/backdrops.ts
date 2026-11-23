/** Backgrounds for the PC (and their ids, shared with the phone): space scenes painted by
 *  spaceArt.ts over CSS (src/shared/space-backdrops.css), and the phone's original CSS
 *  backgrounds (src/shared/flat-backdrops.css). */
export const SPACE_BACKDROPS = [
  { id: 'horizon', label: 'Event horizon (black hole)' },
  { id: 'wormhole', label: 'Wormhole' },
  { id: 'ringed', label: 'Ringed giant' },
  { id: 'sun', label: 'Distant sun' },
  { id: 'orbit', label: 'From orbit' },
  { id: 'deepfield', label: 'Deep field' },
] as const;
export type SpaceBackdrop = (typeof SPACE_BACKDROPS)[number]['id'];
export const isSpaceBackdrop = (v: unknown): v is SpaceBackdrop =>
  SPACE_BACKDROPS.some((b) => b.id === v);

export const FLAT_BACKDROPS = [
  { id: 'aurora', label: 'Aurora glow' },
  { id: 'grid', label: 'Holo grid' },
  { id: 'stars', label: 'Starfield' },
  { id: 'circuit', label: 'Circuit lines' },
  { id: 'nebula', label: 'Nebula' },
  { id: 'ocean', label: 'Deep ocean' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'forest', label: 'Forest night' },
  { id: 'hex', label: 'Hex shield' },
  { id: 'carbon', label: 'Carbon fibre' },
  { id: 'bokeh', label: 'City lights' },
  { id: 'rings', label: 'Arc rings' },
  { id: 'drift', label: 'Colour drift (moves)' },
] as const;
export type FlatBackdrop = (typeof FLAT_BACKDROPS)[number]['id'];

export type Backdrop = SpaceBackdrop | FlatBackdrop;
export const isBackdrop = (v: unknown): v is Backdrop =>
  isSpaceBackdrop(v) || FLAT_BACKDROPS.some((b) => b.id === v);
