/** Space backgrounds drawn in CSS (src/shared/space-backdrops.css), for the PC and the phone. */
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
