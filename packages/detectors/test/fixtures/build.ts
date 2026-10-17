import { THRESHOLDS, type Observation } from "@aerotrack/shared";
import type { DetectContext } from "../../src";

// Fixed synthetic start time: 2026-10-17 01:20:00 UTC (12:20 pm in Sydney).
export const T0 = 1_792_200_000;

export interface Start {
  t?: number;
  lat?: number;
  lon?: number;
  altFt?: number;
  trackDeg?: number;
  gsKt?: number;
  onGround?: boolean;
}

export interface Leg {
  sec: number;
  climbFpm?: number;
  turnDegPerSec?: number;
  onGround?: boolean;
}

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Dead-reckons a synthetic flight. Includes the start point, then one point
 * every dtSec for each leg. Positions move consistently with gsKt and track
 * so hygiene filters treat the track as plausible.
 */
export function fly(legs: Leg[], start: Start = {}, dtSec = 7): Observation[] {
  let t = start.t ?? T0;
  let lat = start.lat ?? -33.9;
  let lon = start.lon ?? 151.0;
  let alt = start.altFt ?? 10000;
  let track = start.trackDeg ?? 90;
  const gs = start.gsKt ?? 250;

  const out: Observation[] = [
    point(t, lat, lon, alt, gs, track, 0, start.onGround ?? false),
  ];

  for (const leg of legs) {
    const steps = Math.round(leg.sec / dtSec);
    for (let i = 0; i < steps; i++) {
      t += dtSec;
      track = norm(track + (leg.turnDegPerSec ?? 0) * dtSec);
      const nm = (gs * dtSec) / 3600;
      const rad = (track * Math.PI) / 180;
      lat += (nm * Math.cos(rad)) / 60;
      lon += (nm * Math.sin(rad)) / (60 * Math.cos((lat * Math.PI) / 180));
      const onGround = leg.onGround ?? false;
      alt = onGround ? 0 : alt + ((leg.climbFpm ?? 0) * dtSec) / 60;
      out.push(point(t, lat, lon, alt, gs, track, leg.climbFpm ?? 0, onGround));
    }
  }
  return out;
}

function point(
  t: number,
  lat: number,
  lon: number,
  alt: number,
  gs: number,
  track: number,
  rate: number,
  onGround: boolean,
): Observation {
  return {
    t,
    lat,
    lon,
    altFt: onGround ? 0 : Math.round(alt / 25) * 25,
    onGround,
    gsKt: gs,
    trackDeg: Math.round(track * 100) / 100,
    baroRateFpm: rate,
  };
}

/** Context for a track: "now" is the last position time unless overridden. */
export function ctxFor(track: Observation[], overrides: Partial<DetectContext> = {}): DetectContext {
  const last = track.length ? Math.max(...track.map((o) => o.t)) : T0;
  return {
    now: last,
    lastPosTs: last,
    squawk: null,
    emergency: null,
    thresholds: THRESHOLDS,
    ...overrides,
  };
}

/** Replace fields on the point at index i (returns a new array). */
export function withPoint(track: Observation[], i: number, patch: Partial<Observation>): Observation[] {
  return track.map((o, j) => (j === i ? { ...o, ...patch } : o));
}
