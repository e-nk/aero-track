import type { Detection, Observation } from "@aerotrack/shared";
import type { DetectContext } from "./context";

/**
 * SPEC 9.5. At least minConsecutiveObs consecutive airborne points descending
 * at minRateFpm or faster, spanning minSpanSec. Uses the reported vertical
 * speed, or the rate between consecutive altitudes when it's missing. Runs on
 * clean points, so a removed glitch reading can never cause it. Reports the
 * most recent qualifying run.
 */
export function detectRapidDescent(segment: Observation[], ctx: DetectContext): Detection | null {
  const th = ctx.thresholds.rapidDescent;
  const pts = segment.filter((o) => !o.onGround);
  const rateAt = (i: number): number | null => {
    const o = pts[i]!;
    if (o.baroRateFpm !== null) return o.baroRateFpm;
    const prev = pts[i - 1];
    if (!prev || prev.altFt === null || o.altFt === null || o.t === prev.t) return null;
    return ((o.altFt - prev.altFt) / (o.t - prev.t)) * 60;
  };

  let best: { from: number; to: number } | null = null;
  let runStart = -1;
  for (let i = 0; i <= pts.length; i++) {
    const rate = i < pts.length ? rateAt(i) : null;
    const fast = rate !== null && rate <= -th.minRateFpm;
    if (fast && runStart < 0) runStart = i;
    if (!fast && runStart >= 0) {
      const to = i - 1;
      if (to - runStart + 1 >= th.minConsecutiveObs && pts[to]!.t - pts[runStart]!.t >= th.minSpanSec) best = { from: runStart, to };
      runStart = -1;
    }
  }
  if (!best) return null;

  const run = pts.slice(best.from, best.to + 1);
  const rates = run.map((_, k) => rateAt(best!.from + k)!);
  // Altitude from the last point before the drop began, when there is one.
  const startAlt = (pts[best.from - 1] ?? run[0]!).altFt;
  const endAlt = run.at(-1)!.altFt;
  const evidence: Detection["evidence"] = {
    peakRateFpm: Math.round(Math.min(...rates)),
    avgRateFpm: Math.round(rates.reduce((s, r) => s + r, 0) / rates.length),
    spanSec: run.at(-1)!.t - run[0]!.t,
  };
  if (startAlt !== null) evidence.startAltFt = startAlt;
  if (endAlt !== null) evidence.endAltFt = endAlt;
  return { type: "rapid_descent", confidence: "observed", windowStart: run[0]!.t, windowEnd: run.at(-1)!.t, evidence };
}
