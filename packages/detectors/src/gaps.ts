import type { Detection, Observation, Thresholds } from "@aerotrack/shared";

/** Splits a sorted track where dt > gap.thresholdSec (SPEC 9.8). Reports the latest gap. */
export function splitGaps(
  points: Observation[],
  thresholds: Thresholds,
): { segments: Observation[][]; gap: Detection | null } {
  const segments: Observation[][] = [];
  let gap: Detection | null = null;
  let current: Observation[] = [];

  for (const p of points) {
    const prev = current.at(-1);
    if (prev && p.t - prev.t > thresholds.gap.thresholdSec) {
      segments.push(current);
      current = [];
      gap = {
        type: "gap",
        confidence: "fact",
        windowStart: prev.t,
        windowEnd: p.t,
        evidence: { gapStart: prev.t, gapEnd: p.t, gapSec: p.t - prev.t },
      };
    }
    current.push(p);
  }
  if (current.length) segments.push(current);

  return { segments, gap };
}
