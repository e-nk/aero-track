import type { Detection, Observation, Thresholds } from "@aerotrack/shared";

/**
 * Finds single altitude spikes that revert (SPEC 9.7). A point is a glitch when
 * the implied rate from the previous good altitude exceeds spikeRateFpm and,
 * within revertWithinSamples, altitude returns within revertToleranceFt of that
 * previous good altitude. Glitch points are removed. Reports the latest glitch.
 */
export function removeGlitches(
  points: Observation[],
  thresholds: Thresholds,
): { clean: Observation[]; glitch: Detection | null } {
  const { spikeRateFpm, revertWithinSamples, revertToleranceFt } = thresholds.glitch;
  const bad = new Set<number>();
  let glitch: Detection | null = null;
  let count = 0;
  let prev: Observation | null = null; // last good point with a known altitude

  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!;
    if (bad.has(i) || cur.altFt === null) continue;
    if (prev === null || prev.altFt === null) {
      prev = cur;
      continue;
    }

    const dt = cur.t - prev.t;
    const rate = dt > 0 ? ((cur.altFt - prev.altFt) / dt) * 60 : Infinity;
    if (Math.abs(rate) > spikeRateFpm) {
      const revertAt = findRevert(points, i, prev.altFt, revertWithinSamples, revertToleranceFt);
      if (revertAt !== null) {
        for (let j = i; j < revertAt; j++) bad.add(j);
        count++;
        glitch = {
          type: "glitch",
          confidence: "fact",
          windowStart: cur.t,
          windowEnd: cur.t,
          evidence: {
            glitchAltFt: cur.altFt,
            expectedAltFt: prev.altFt,
            impliedRateFpm: Math.round(rate),
            at: cur.t,
            count,
          },
        };
        continue;
      }
    }
    prev = cur;
  }

  return { clean: points.filter((_, i) => !bad.has(i)), glitch };
}

function findRevert(
  points: Observation[],
  i: number,
  expectedAlt: number,
  within: number,
  tolerance: number,
): number | null {
  for (let j = i + 1; j <= i + within && j < points.length; j++) {
    const alt = points[j]!.altFt;
    if (alt !== null && Math.abs(alt - expectedAlt) <= tolerance) return j;
  }
  return null;
}
