import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";
import { dHeading } from "./geo";

/** SPEC 9.3. Sum of signed heading changes over the last turn.windowSec of the latest segment. */
export function detectTurn(segment: Observation[], ctx: DetectContext): Detection | null {
  const th = ctx.thresholds.turn;
  const end = segment.at(-1)?.t;
  if (end === undefined) return null;

  const win = segment.filter(
    (o): o is Observation & { trackDeg: number } =>
      o.t >= end - th.windowSec && !o.onGround && o.trackDeg !== null,
  );

  let sum = 0;
  for (let i = 1; i < win.length; i++) {
    const d = dHeading(win[i - 1]!.trackDeg, win[i]!.trackDeg);
    if (Math.abs(d) >= th.ignoreStepBelowDeg) sum += d;
  }
  if (Math.abs(sum) < th.minCumulativeDeg) return null;

  const first = win[0]!;
  const last = win.at(-1)!;
  return {
    type: "turn",
    confidence: "observed",
    windowStart: first.t,
    windowEnd: last.t,
    evidence: {
      totalDeg: Math.round(sum * 10) / 10,
      direction: sum < 0 ? "left" : "right",
      spanSec: last.t - first.t,
    },
  };
}
