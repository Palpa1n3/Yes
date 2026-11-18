import { playSfx, type Sfx } from './sfx';

/** Sound-effect hook (mute via Settings › Voice › Sound effects). */
export function useSfx(): (name: Sfx) => void {
  return playSfx;
}
