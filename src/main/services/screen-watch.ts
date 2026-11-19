/** Screen awareness: keeps the latest picture of what the user is looking at (never ARC
 *  itself), in memory only, so Claude can look when a question needs it. */

export interface Frame {
  /** JPEG bytes, longest side ≤ 1568 px (what Claude reads best). */
  jpeg: Buffer;
  at: number;
  width: number;
  height: number;
}

export interface ScreenDeps {
  /** Grab the display the user is working on, or null if it can't. */
  grab(): Promise<Frame | null>;
  enabled(): boolean;
  /** True while ARC is in front (a capture would just show ARC). */
  arcInFront(): boolean;
  /** Skip routine captures (e.g. during a game, to avoid stutter). */
  paused(): boolean;
  now?: () => number;
}

export const MAX_AGE_MS = 2 * 60_000;

export class ScreenWatch {
  private latest: Frame | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private grabbing: Promise<void> | null = null;
  private readonly now: () => number;

  constructor(private readonly d: ScreenDeps) {
    this.now = d.now ?? Date.now;
  }

  /** Take a picture now (if allowed and ARC isn't in the way). */
  capture(): Promise<void> {
    if (!this.d.enabled() || this.d.arcInFront()) return Promise.resolve();
    this.grabbing ??= this.d
      .grab()
      .then((f) => {
        if (f) this.latest = f;
      })
      .catch(() => undefined)
      .finally(() => {
        this.grabbing = null;
      });
    return this.grabbing;
  }

  /** The picture for Claude: the latest recent one, or a fresh one. */
  async forModel(): Promise<{ frame: Frame; ageSec: number; arcVisible: boolean } | null> {
    if (!this.d.enabled()) return null;
    const fresh = this.latest && this.now() - this.latest.at < MAX_AGE_MS;
    if (!fresh) {
      // Nothing recent: grab now, even with ARC in front (better than nothing).
      const f = await this.d.grab().catch(() => null);
      if (!f) return null;
      this.latest = f;
      return { frame: f, ageSec: 0, arcVisible: this.d.arcInFront() };
    }
    const frame = this.latest as Frame;
    return { frame, ageSec: Math.round((this.now() - frame.at) / 1000), arcVisible: false };
  }

  forget(): void {
    this.latest = null;
  }

  start(intervalMs = 5000): void {
    this.timer = setInterval(() => {
      if (!this.d.paused()) void this.capture();
      else if (!this.d.enabled()) this.latest = null;
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.latest = null;
  }
}
