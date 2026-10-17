import type { Detection, Observation, Thresholds } from "@aerotrack/shared";
import type { DetectContext } from "./context";

type Th = Thresholds["climbDescent"];

/** SPEC 9.2. Run on the latest segment. On-ground points are ignored. */
export function detectClimbDescent(segment: Observation[], ctx: DetectContext): Detection | null {
  const th = ctx.thresholds.climbDescent;
  const airborne = segment.filter((o) => !o.onGround);
  return byAltitude(airborne, th) ?? byVerticalRate(airborne, th);
}

/**
 * Trigger A: the longest recent window whose net altitude change reaches
 * minNetFt with at least monotonicShare of steps in that direction.
 */
function byAltitude(airborne: Observation[], th: Th): Detection | null {
  const pts = airborne.filter((o): o is Observation & { altFt: number } => o.altFt !== null);
  const n = pts.length;
  const last = pts[n - 1];
  if (!last) return null;

  for (let s = 0; s <= n - th.minObs; s++) {
    const first = pts[s]!;
    const net = last.altFt - first.altFt;
    if (Math.abs(net) < th.minNetFt || last.t - first.t < th.minSpanSec) continue;

    const dir = Math.sign(net);
    let inDir = 0;
    for (let i = s + 1; i < n; i++) if (Math.sign(pts[i]!.altFt - pts[i - 1]!.altFt) === dir) inDir++;
    if (inDir / (n - 1 - s) < th.monotonicShare) continue;

    // Start the window at the first step that moves in the detected direction.
    let start = s;
    while (start < n - 1 && Math.sign(pts[start + 1]!.altFt - pts[start]!.altFt) !== dir) start++;
    return build(pts.slice(start), "altitude");
  }
  return null;
}

/**
 * Trigger B: the most recent points all report |baro_rate| above baroRateFpm
 * with the same sign, for at least minObs points spanning minSpanSec.
 */
function byVerticalRate(airborne: Observation[], th: Th): Detection | null {
  const run: Observation[] = [];
  let sign = 0;
  for (let i = airborne.length - 1; i >= 0; i--) {
    const rate = airborne[i]!.baroRateFpm;
    if (rate === null || Math.abs(rate) <= th.baroRateFpm) break;
    if (sign !== 0 && Math.sign(rate) !== sign) break;
    sign = Math.sign(rate);
    run.unshift(airborne[i]!);
  }
  if (run.length < th.minObs || run.at(-1)!.t - run[0]!.t < th.minSpanSec) return null;
  return build(run, "vertical_rate", sign);
}

function build(win: Observation[], basis: "altitude" | "vertical_rate", rateSign = 0): Detection {
  const first = win[0]!;
  const last = win.at(-1)!;
  const spanSec = last.t - first.t;
  const evidence: Detection["evidence"] = { basis, spanSec, obs: win.length };

  const withAlt = win.filter((o) => o.altFt !== null);
  const a = withAlt[0]?.altFt;
  const b = withAlt.at(-1)?.altFt;
  let sign = rateSign;
  if (a != null && b != null && withAlt.length >= 2) {
    const net = b - a;
    evidence.startAltFt = a;
    evidence.endAltFt = b;
    evidence.netFt = net;
    if (basis === "altitude") sign = Math.sign(net);
  }

  const rates = win.map((o) => o.baroRateFpm).filter((r): r is number => r !== null);
  if (evidence.netFt !== undefined && spanSec > 0) {
    evidence.avgRateFpm = Math.round((Number(evidence.netFt) / spanSec) * 60);
  } else if (rates.length) {
    evidence.avgRateFpm = Math.round(rates.reduce((s, r) => s + r, 0) / rates.length);
  }

  return {
    type: sign > 0 ? "climb" : "descent",
    confidence: "observed",
    windowStart: first.t,
    windowEnd: last.t,
    evidence,
  };
}
