import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";
import { nearestAirport } from "./geo";

/** SPEC 9.6. Fact: no new position for more than signalLost.afterSec. */
export function detectSignalLost(track: Observation[], ctx: DetectContext): Detection | null {
  const age = ctx.now - ctx.lastPosTs;
  if (age <= ctx.thresholds.signalLost.afterSec) return null;

  const evidence: Detection["evidence"] = { secondsSinceLastPosition: age };
  const last = track.at(-1);
  if (last) {
    if (last.altFt !== null) evidence.lastAltFt = last.altFt;
    evidence.lastLat = last.lat;
    evidence.lastLon = last.lon;
    const rate = last.baroRateFpm;
    const level = ctx.thresholds.display.levelRateFpm;
    if (rate !== null) evidence.lastVertical = rate <= -level ? "descending" : rate >= level ? "climbing" : "level";
    const near = nearestAirport(last.lat, last.lon, ctx.thresholds.takeoffLanding.nearAirportKm);
    if (near) {
      evidence.nearAirport = near.airport.ident;
      evidence.nearAirportName = near.airport.name;
      evidence.nearAirportKm = Math.round(near.km * 10) / 10;
    }
  }

  return {
    type: "signal_lost",
    confidence: "fact",
    windowStart: ctx.lastPosTs,
    windowEnd: ctx.now,
    evidence,
  };
}
