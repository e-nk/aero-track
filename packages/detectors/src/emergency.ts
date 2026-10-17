import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";

/** SPEC 9.9. Squawk 7700, or an emergency status other than "none". A fact; never interpreted. */
export function detectEmergency(track: Observation[], ctx: DetectContext): Detection | null {
  const status = ctx.emergency && ctx.emergency !== "none" ? ctx.emergency : null;
  if (ctx.squawk !== "7700" && !status) return null;
  const evidence: Detection["evidence"] = {};
  if (ctx.squawk) evidence.squawk = ctx.squawk;
  if (status) evidence.emergency = status;
  const at = track.at(-1)?.t ?? ctx.now;
  return { type: "emergency", confidence: "fact", windowStart: at, windowEnd: ctx.now, evidence };
}
