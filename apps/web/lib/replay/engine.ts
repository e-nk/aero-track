import { EventLifecycle, runAll, type LifecycleChanges } from "@aerotrack/detectors";
import {
  pointToObservation,
  type BehaviourEvent,
  type Observation,
  type RecordingAircraft,
  type RecordingFile,
  type Thresholds,
} from "@aerotrack/shared";
import type { LiveAircraft } from "../liveState";

// Client-side replay (SPEC 12.5). Same detectors and lifecycle as the live
// server, driven by the replay clock instead of the wall clock. No network.

const emptyChanges = (): LifecycleChanges => ({ opened: [], updated: [], closed: [] });

export class ReplayEngine {
  readonly start: number;
  readonly end: number;
  /** Detector evaluations so far (each one is a simulated poll). */
  evaluations = 0;
  clock: number;

  private readonly evalSec: number;
  private readonly byHex: Map<string, RecordingAircraft>;
  private cursor = new Map<string, number>(); // points consumed per aircraft
  private gone = new Set<string>(); // aircraft past buffer.keepSec without news
  private lifecycle!: EventLifecycle;
  private nextEval!: number;
  private ids = 0;

  constructor(
    private readonly recording: RecordingFile,
    private readonly thresholds: Thresholds,
  ) {
    this.start = recording.capturedFrom;
    this.end = recording.capturedTo;
    this.evalSec = thresholds.poll.intervalMs / 1000;
    this.byHex = new Map(recording.aircraft.map((a) => [a.hex, a]));
    this.clock = this.start;
    this.reset();
  }

  /** Move the replay clock forward (or back, which starts over). Returns event changes. */
  advanceTo(target: number): LifecycleChanges {
    const t = Math.min(Math.max(target, this.start), this.end);
    if (t < this.clock) return this.seek(t);

    const changes = emptyChanges();
    // Evaluate at each simulated poll on the way, seeing only points up to that moment.
    while (this.nextEval <= t) {
      this.consumeUpTo(this.nextEval);
      const c = this.evaluate(this.nextEval);
      changes.opened.push(...c.opened);
      changes.updated.push(...c.updated);
      changes.closed.push(...c.closed);
      this.nextEval += this.evalSec;
    }
    this.consumeUpTo(t);
    this.clock = t;
    return changes;
  }

  /** Jump to a time by replaying from the start (recordings are short, so this is quick). */
  seek(target: number): LifecycleChanges {
    this.reset();
    return this.advanceTo(target);
  }

  /** Aircraft that have reported by the replay clock, in the same shape as live ones. */
  aircraft(nowMs: number): LiveAircraft[] {
    const out: LiveAircraft[] = [];
    for (const [hex, a] of this.byHex) {
      const n = this.cursor.get(hex) ?? 0;
      if (n === 0 || this.gone.has(hex)) continue;
      const [t, lat, lon, altFt, gsKt, trackDeg, baroRateFpm, onGround] = a.points[n - 1]!;
      out.push({
        hex,
        callsign: a.callsign,
        lat,
        lon,
        altFt,
        gsKt,
        trackDeg,
        baroRateFpm,
        typeCode: a.typeCode,
        category: a.category,
        lastPosTs: t,
        hasOpenEvent: this.lifecycle.openEvents(hex).length > 0,
        onGround,
        altGeomFt: null, // recordings carry barometric altitude only
        receivedAtMs: nowMs,
        serverNow: this.clock,
      });
    }
    return out;
  }

  openEvents(): BehaviourEvent[] {
    return this.lifecycle.openEvents();
  }

  identity(hex: string): Omit<RecordingAircraft, "points"> | undefined {
    const a = this.byHex.get(hex);
    if (!a) return undefined;
    return { hex: a.hex, callsign: a.callsign, registration: a.registration, typeCode: a.typeCode, category: a.category };
  }

  /** The aircraft's observations in the buffer window at the replay clock. */
  track(hex: string): Observation[] {
    return this.window(hex, this.clock);
  }

  private reset() {
    this.cursor = new Map();
    this.gone = new Set();
    this.lifecycle = new EventLifecycle({
      thresholds: this.thresholds,
      mode: this.recording.mode,
      newId: () => `${this.recording.id}-${++this.ids}`,
    });
    this.nextEval = this.start;
    this.evaluations = 0;
    this.clock = this.start;
  }

  private consumeUpTo(t: number) {
    for (const [hex, a] of this.byHex) {
      let n = this.cursor.get(hex) ?? 0;
      while (n < a.points.length && a.points[n]![0] <= t) n++;
      this.cursor.set(hex, n);
      if (n > 0 && this.gone.has(hex) && t - a.points[n - 1]![0] <= this.thresholds.buffer.keepSec) this.gone.delete(hex);
    }
  }

  private window(hex: string, now: number): Observation[] {
    const a = this.byHex.get(hex);
    const n = this.cursor.get(hex) ?? 0;
    if (!a || n === 0) return [];
    const since = now - this.thresholds.buffer.keepSec;
    return a.points.slice(0, n).filter((p) => p[0] >= since).map(pointToObservation);
  }

  private evaluate(now: number): LifecycleChanges {
    const changes = emptyChanges();
    const merge = (c: LifecycleChanges) => {
      changes.opened.push(...c.opened);
      changes.updated.push(...c.updated);
      changes.closed.push(...c.closed);
    };
    for (const [hex, a] of this.byHex) {
      const n = this.cursor.get(hex) ?? 0;
      if (n === 0 || this.gone.has(hex)) continue;
      const last = a.points[n - 1]!;
      // Like the live buffer: an aircraft silent for keepSec leaves, and its events close.
      if (now - last[0] > this.thresholds.buffer.keepSec) {
        this.gone.add(hex);
        merge(this.lifecycle.closeAll(hex, now));
        continue;
      }
      const { detections } = runAll(this.window(hex, now), {
        now,
        lastPosTs: last[0],
        squawk: last[8],
        emergency: null,
        thresholds: this.thresholds,
      });
      merge(this.lifecycle.step(hex, detections, now));
    }
    this.evaluations++;
    return changes;
  }
}
