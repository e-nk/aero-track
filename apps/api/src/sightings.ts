import type { BehaviourEvent } from "@aerotrack/shared";

// "Seen by AeroTrack" (SPEC 11.9). Counts only what our own coverage showed.

export interface Sighting {
  id: string;
  hex: string;
  startedAt: number; // epoch seconds
  lastSeenAt: number;
  tookOffAt: number | null;
  takeoffAirport: string | null;
  landedAt: number | null;
  landingAirport: string | null;
}

export interface SightingTrackerOptions {
  keepSec: number;
  newId: () => string;
  /** Sightings that were open before a restart. */
  seed?: Sighting[];
}

export class SightingTracker {
  private readonly open = new Map<string, Sighting>();

  constructor(private readonly opts: SightingTrackerOptions) {
    for (const s of opts.seed ?? []) this.open.set(s.hex, s);
  }

  current(hex: string): Sighting | undefined {
    return this.open.get(hex);
  }

  /** A new observation of an aircraft at time t. Returns the sighting to persist. */
  touch(hex: string, t: number): Sighting {
    const cur = this.open.get(hex);
    const next = cur && t - cur.lastSeenAt <= this.opts.keepSec ? { ...cur, lastSeenAt: Math.max(cur.lastSeenAt, t) } : this.start(hex, t);
    this.open.set(hex, next);
    return next;
  }

  /** Apply a take-off or landing event. Returns the changed sighting, or null if nothing changed. */
  applyEvent(e: BehaviourEvent): Sighting | null {
    if (e.type !== "takeoff" && e.type !== "landing") return null;
    const cur = this.open.get(e.hex);
    const at = typeof e.evidence.at === "number" ? e.evidence.at : null;
    if (!cur || at === null) return null;
    const airport = typeof e.evidence.airport === "string" ? e.evidence.airport : null;

    let next: Sighting;
    if (e.type === "takeoff") {
      if (cur.tookOffAt === at) return null;
      // Took off again after landing: that's a new flight we watched.
      const base = cur.landedAt !== null ? this.start(e.hex, at) : cur;
      next = { ...base, tookOffAt: at, takeoffAirport: airport, lastSeenAt: Math.max(base.lastSeenAt, at) };
    } else {
      if (cur.landedAt === at) return null;
      next = { ...cur, landedAt: at, landingAirport: airport, lastSeenAt: Math.max(cur.lastSeenAt, at) };
    }
    this.open.set(e.hex, next);
    return next;
  }

  /** Forget sightings with nothing for keepSec (they stay in the database). */
  prune(nowSec: number): void {
    for (const [hex, s] of this.open) if (nowSec - s.lastSeenAt > this.opts.keepSec) this.open.delete(hex);
  }

  private start(hex: string, t: number): Sighting {
    return {
      id: this.opts.newId(),
      hex,
      startedAt: t,
      lastSeenAt: t,
      tookOffAt: null,
      takeoffAirport: null,
      landedAt: null,
      landingAirport: null,
    };
  }
}
