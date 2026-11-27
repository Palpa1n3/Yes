/** Automatic updates from the GitHub Releases of the ARC repo. */
export type UpdateStatus =
  | 'dev' // running from source (npm run dev): updates come from your own builds
  | 'idle'
  | 'checking'
  | 'none' // up to date
  | 'downloading'
  | 'ready' // downloaded; installs on restart
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  /** The new version, when there is one. */
  version: string | null;
  percent: number | null;
  error: string | null;
  checkedAt: number | null;
  /** The version this one was updated from (Settings can go back to it). */
  previous?: string | null;
  /** A newer version that isn't installed because Alton rolled back from it. */
  skipped?: string | null;
}
