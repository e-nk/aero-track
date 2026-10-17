import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";

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
  }

  return {
    type: "signal_lost",
    confidence: "fact",
    windowStart: ctx.lastPosTs,
    windowEnd: ctx.now,
    evidence,
  };
}
