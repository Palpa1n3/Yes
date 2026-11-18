/** Watches for games; while one runs: High performance power plan, close chosen apps
 *  (politely), quiet ARC. Everything is put back when the game closes. */
import { IDLE_GAMING, gameLabel, isGame, type GamingStatus } from '@shared/gaming';

export interface GamingSettings {
  enabled: boolean;
  powerPlan: boolean;
  closeApps: string[];
  extraGames: string[];
}

export interface GamingDeps {
  listProcesses(): Promise<Array<{ name: string; path: string | null }>>;
  settings(): GamingSettings;
  /** Current power plan GUID, or null. */
  getPowerPlan(): Promise<string | null>;
  /** Switch to a plan GUID, or 'high' for High performance. */
  setPowerPlan(plan: string): Promise<boolean>;
  closeApp(name: string): Promise<boolean>;
  launchApp(name: string): Promise<boolean>;
  onChange(s: GamingStatus): void;
  now?: () => number;
}

/** A game must be gone for this many checks in a row before we restore things. */
const GONE_CHECKS = 2;

export class GamingMode {
  private status: GamingStatus = { ...IDLE_GAMING };
  private prevPlan: string | null = null;
  private closed: string[] = [];
  private missing = 0;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;

  constructor(private readonly d: GamingDeps) {
    this.now = d.now ?? Date.now;
  }

  get(): GamingStatus {
    return { ...this.status, actions: [...this.status.actions] };
  }

  /** One check: start or end gaming mode as needed. */
  async poll(): Promise<void> {
    const s = this.d.settings();
    if (this.busy || (!s.enabled && !this.status.manual)) {
      if (!s.enabled && this.status.active && !this.status.manual) await this.stop();
      return;
    }
    this.busy = true;
    try {
      const procs = await this.d.listProcesses().catch(() => null);
      if (!procs) return;
      const game = procs.find((p) => isGame(p.name, p.path, s.extraGames));
      if (game && !this.status.active) await this.begin(gameLabel(game.name), false);
      else if (game && this.status.active) this.missing = 0;
      else if (!game && this.status.active && !this.status.manual && ++this.missing >= GONE_CHECKS)
        await this.end();
    } finally {
      this.busy = false;
    }
  }

  /** Start by hand (no game needed). */
  async start(): Promise<void> {
    if (!this.status.active) await this.begin(null, true);
  }

  async stop(): Promise<void> {
    if (this.status.active) await this.end();
  }

  private async begin(game: string | null, manual: boolean): Promise<void> {
    const s = this.d.settings();
    const actions: string[] = [];
    this.missing = 0;
    this.closed = [];
    if (s.powerPlan) {
      this.prevPlan = await this.d.getPowerPlan().catch(() => null);
      if (await this.d.setPowerPlan('high').catch(() => false))
        actions.push('High performance power plan');
      else this.prevPlan = null;
    }
    for (const app of s.closeApps) {
      if (await this.d.closeApp(app).catch(() => false)) {
        this.closed.push(app);
        actions.push(`Closed ${app}`);
      }
    }
    this.status = { active: true, game, since: this.now(), manual, actions };
    this.d.onChange(this.get());
  }

  private async end(): Promise<void> {
    if (this.prevPlan) await this.d.setPowerPlan(this.prevPlan).catch(() => false);
    for (const app of this.closed) await this.d.launchApp(app).catch(() => false);
    this.prevPlan = null;
    this.closed = [];
    this.missing = 0;
    this.status = { ...IDLE_GAMING };
    this.d.onChange(this.get());
  }

  startWatching(intervalMs = 20_000): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
    this.timer.unref?.();
  }

  /** On quit: put the power plan back. */
  async dispose(): Promise<void> {
    clearInterval(this.timer);
    if (this.prevPlan) await this.d.setPowerPlan(this.prevPlan).catch(() => false);
  }
}

/** "Power Scheme GUID: 381b4222-…  (Balanced)" → the GUID. */
export function parsePowerScheme(out: string): string | null {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(out)?.[1] ?? null;
}
