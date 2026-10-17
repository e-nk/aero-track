import type { Detection, Observation, Thresholds } from "@aerotrack/shared";
import { splitGaps } from "./gaps";
import { distanceNm } from "./geo";
import { removeGlitches } from "./glitch";

export type HistoryStatus = "ok" | "insufficient_history";

export interface Preprocessed {
  status: HistoryStatus;
  /** Clean points across all segments (sorted, deduped, hygiene and glitches removed). */
  points: Observation[];
  segments: Observation[][];
  /** The latest segment. Behaviour detectors use only this. */
  latest: Observation[];
  glitch: Detection | null;
  gap: Detection | null;
}

/** SPEC 9.1. Ground handling (alt_baro "ground") happens in the provider adapter. */
export function preprocess(track: Observation[], thresholds: Thresholds): Preprocessed {
  // 1. Sort by t (stable), keep the last-received point for a repeated t.
  const byTime = new Map<number, Observation>();
  for (const o of track) byTime.set(o.t, o);
  const sorted = [...byTime.values()].sort((a, b) => a.t - b.t);

  // 2. Drop points without a usable position.
  const positioned = sorted.filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lon));

  // 4. Drop position jumps faster than maxImpliedGsKt (compared with the last kept point).
  const plausible: Observation[] = [];
  for (const o of positioned) {
    const prev = plausible.at(-1);
    if (prev) {
      const hours = (o.t - prev.t) / 3600;
      const kt = distanceNm(prev.lat, prev.lon, o.lat, o.lon) / hours;
      if (kt > thresholds.hygiene.maxImpliedGsKt) continue;
    }
    plausible.push(o);
  }

  // 5. Glitches, then 6. gaps.
  const { clean, glitch } = removeGlitches(plausible, thresholds);
  const { segments, gap } = splitGaps(clean, thresholds);
  const latest = segments.at(-1) ?? [];

  // 7. Enough history for behaviour detectors?
  const span = latest.length ? latest.at(-1)!.t - latest[0]!.t : 0;
  const status: HistoryStatus =
    latest.length >= thresholds.hygiene.minPoints && span >= thresholds.hygiene.minSpanSec
      ? "ok"
      : "insufficient_history";

  return { status, points: clean, segments, latest, glitch, gap };
}
