import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";
import { dHeading } from "./geo";

/**
 * SPEC 9.4. Possible circling: over the last circling.windowSec, the signed
 * heading changes add up to at least minCumulativeDeg, and at least
 * sameDirectionShare of the real turning steps go the same way. Straight steps
 * (below turn.ignoreStepBelowDeg) don't count against the share, so racetrack
 * holding patterns with straight legs still qualify.
 */
export function detectCircling(segment: Observation[], ctx: DetectContext): Detection | null {
  const th = ctx.thresholds.circling;
  const end = segment.at(-1)?.t;
  if (end === undefined) return null;

  const win = segment.filter(
    (o): o is Observation & { trackDeg: number } => o.t >= end - th.windowSec && !o.onGround && o.trackDeg !== null,
  );
  let sum = 0;
  let right = 0;
  let left = 0;
  for (let i = 1; i < win.length; i++) {
    const d = dHeading(win[i - 1]!.trackDeg, win[i]!.trackDeg);
    sum += d;
    if (Math.abs(d) < ctx.thresholds.turn.ignoreStepBelowDeg) continue;
    if (d > 0) right++;
    else left++;
  }
  const turning = right + left;
  if (Math.abs(sum) < th.minCumulativeDeg || turning === 0) return null;
  if ((sum > 0 ? right : left) / turning < th.sameDirectionShare) return null;

  const alts = win.map((o) => o.altFt).filter((a): a is number => a !== null);
  const first = win[0]!;
  const last = win.at(-1)!;
  const evidence: Detection["evidence"] = {
    totalDeg: Math.round(sum * 10) / 10,
    laps: Math.floor(Math.abs(sum) / 360),
    spanSec: last.t - first.t,
    direction: sum < 0 ? "left" : "right",
  };
  if (alts.length) evidence.altSpreadFt = Math.max(...alts) - Math.min(...alts);
  return { type: "circling", confidence: "possible", windowStart: first.t, windowEnd: last.t, evidence };
}
