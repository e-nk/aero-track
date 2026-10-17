import type { AircraftState, Observation, Thresholds } from "@aerotrack/shared";

export interface NewObservation {
  hex: string;
  obs: Observation;
  squawk: string | null;
  /** Callsign broadcast at that moment (recordings need the one in use then, not a later one). */
  callsign: string | null;
}

/** In-memory ring buffer per aircraft (SPEC 11.2). Detectors read from here. */
export class AircraftStore {
  private readonly tracks = new Map<string, Observation[]>();
  private readonly states = new Map<string, AircraftState>();

  constructor(private readonly thresholds: Thresholds) {}

  /** Merge one poll. Returns only observations newer than what we already hold. */
  ingest(incoming: AircraftState[]): NewObservation[] {
    const added: NewObservation[] = [];
    for (const s of incoming) {
      const track = this.tracks.get(s.hex) ?? [];
      const prev = this.states.get(s.hex);
      const lastT = track.at(-1)?.t ?? -Infinity;

      if (s.last.t > lastT) {
        track.push(s.last);
        this.tracks.set(s.hex, track);
        added.push({ hex: s.hex, obs: s.last, squawk: s.squawk, callsign: s.callsign });
      }
      // Identity fields always refresh; the position only moves forward.
      const newer = !prev || s.lastPosTs >= prev.lastPosTs;
      this.states.set(s.hex, newer ? s : { ...s, last: prev.last, lastPosTs: prev.lastPosTs });
    }
    return added;
  }

  /** Load state saved before a restart. */
  hydrate(states: AircraftState[], tracks: Map<string, Observation[]>): void {
    for (const s of states) this.states.set(s.hex, s);
    for (const [hex, track] of tracks) this.tracks.set(hex, [...track].sort((a, b) => a.t - b.t));
  }

  /**
   * Trim observations older than keepSec and drop aircraft whose last position
   * is older than keepSec. Returns the dropped hexes. Followed aircraft (keep)
   * are never dropped and always keep their last position, so a flight that
   * disappears over the ocean for hours stays on the map at its last fix.
   */
  prune(nowSec: number, keep: ReadonlySet<string> = new Set()): string[] {
    const cutoff = nowSec - this.thresholds.buffer.keepSec;
    const dropped: string[] = [];
    for (const [hex, s] of this.states) {
      if (s.lastPosTs < cutoff && !keep.has(hex)) {
        this.states.delete(hex);
        this.tracks.delete(hex);
        dropped.push(hex);
        continue;
      }
      const track = this.tracks.get(hex);
      if (!track) continue;
      const recent = track.filter((o) => o.t >= cutoff);
      this.tracks.set(hex, recent.length || !keep.has(hex) ? recent : track.slice(-1));
    }
    return dropped;
  }

  get(hex: string): AircraftState | undefined {
    return this.states.get(hex);
  }

  all(): AircraftState[] {
    return [...this.states.values()];
  }

  track(hex: string, sinceSec = -Infinity): Observation[] {
    return (this.tracks.get(hex) ?? []).filter((o) => o.t >= sinceSec);
  }
}
