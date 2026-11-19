/** Journey times from free OpenStreetMap services: place search (Nominatim) and routes
 *  (OSRM). No live traffic, so driving times get a safety margin. Also "leave by" heads-ups
 *  for calendar events that have a location. */
import type { CalEvent } from '@shared/calendar';

export type TravelMode = 'driving' | 'walking' | 'cycling';
export interface Place {
  lat: number;
  lon: number;
  name: string;
}
export interface Journey {
  minutes: number;
  km: number;
  mode: TravelMode;
  /** Minutes to allow, with the margin (no live traffic data). */
  allow: number;
}

/** Driving without live traffic: allow 20% more, plus 5 minutes to get going/park. */
export function allowFor(minutes: number, mode: TravelMode): number {
  return mode === 'driving' ? Math.ceil(minutes * 1.2 + 5) : Math.ceil(minutes + 3);
}

const ROUTERS: Record<TravelMode, string> = {
  driving: 'https://router.project-osrm.org/route/v1/driving',
  walking: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  cycling: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
};

export type Fetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** A generic client name (no personal details), as the services ask for. */
const HEADERS = { 'user-agent': 'ARC-desktop-assistant/1.0', accept: 'application/json' };

export class JourneyService {
  private places = new Map<string, Place | null>();

  constructor(private readonly fetch: Fetch) {}

  async find(query: string): Promise<Place | null> {
    const q = query.trim().slice(0, 200);
    if (!q) return null;
    const key = q.toLowerCase();
    if (this.places.has(key)) return this.places.get(key) ?? null;
    const r = await this.fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: HEADERS },
    );
    const list = r.ok ? ((await r.json()) as Array<Record<string, unknown>>) : [];
    const hit = Array.isArray(list) ? list[0] : undefined;
    const place =
      hit && Number.isFinite(Number(hit['lat'])) && Number.isFinite(Number(hit['lon']))
        ? {
            lat: Number(hit['lat']),
            lon: Number(hit['lon']),
            name: String(hit['display_name'] ?? q)
              .split(',')
              .slice(0, 3)
              .join(','),
          }
        : null;
    this.places.set(key, place);
    return place;
  }

  async route(from: Place, to: Place, mode: TravelMode = 'driving'): Promise<Journey | null> {
    const url = `${ROUTERS[mode]}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const r = await this.fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    const j = (await r.json()) as { routes?: Array<{ duration?: number; distance?: number }> };
    const best = j.routes?.[0];
    if (!best || !Number.isFinite(best.duration)) return null;
    const minutes = Math.max(1, Math.round((best.duration ?? 0) / 60));
    return {
      minutes,
      km: Math.round(((best.distance ?? 0) / 1000) * 10) / 10,
      mode,
      allow: allowFor(minutes, mode),
    };
  }
}

/** 24-hour "12:25". */
const hm = (t: number): string => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** "Leave by" heads-ups: for events with a location starting in the next few hours, works out
 *  the journey from home once and gives one heads-up 10 minutes before it's time to go. */
export class LeaveReminders {
  private planned = new Map<string, number | null>();
  private told = new Set<string>();

  constructor(
    private readonly d: {
      journeys: JourneyService;
      home(): Place | null;
      events(): CalEvent[] | null;
      enabled(): boolean;
      notify(text: string): void;
      now?: () => number;
    },
  ) {}

  /** One check (every few minutes). */
  async tick(): Promise<void> {
    if (!this.d.enabled()) return;
    const home = this.d.home();
    const events = this.d.events();
    if (!home || !events) return;
    const now = this.d.now?.() ?? Date.now();
    for (const e of events) {
      if (e.allDay || !e.location || e.start <= now || e.start - now > 4 * 3600_000) continue;
      if (this.told.has(e.id)) continue;
      if (!this.planned.has(e.id)) {
        const to = await this.d.journeys.find(e.location).catch(() => null);
        const j = to ? await this.d.journeys.route(home, to).catch(() => null) : null;
        this.planned.set(e.id, j ? j.allow : null);
      }
      const allow = this.planned.get(e.id);
      if (!allow || allow < 5) continue; // unknown place, or practically next door
      const leaveAt = e.start - allow * 60_000;
      if (now >= leaveAt - 10 * 60_000) {
        this.told.add(e.id);
        this.d.notify(
          `Leave by ${hm(leaveAt)} for ${e.title} at ${hm(e.start)} (${e.location}): about ${allow} minutes by car, allowing for traffic.`,
        );
      }
    }
  }
}
