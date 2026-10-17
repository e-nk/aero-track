import type { Detection, Observation } from "@aerotrack/shared";
import { detectClimbDescent } from "./climbDescent";
import type { DetectContext } from "./context";
import { preprocess, type HistoryStatus } from "./preprocess";
import { detectSignalLost } from "./signalLost";
import { detectTakeoffLanding } from "./takeoffLanding";
import { detectTurn } from "./turn";

export type { DetectContext } from "./context";
export type { HistoryStatus, Preprocessed } from "./preprocess";
export { preprocess } from "./preprocess";
export { dHeading, distanceNm, nearestAirport } from "./geo";
export { explain, formatDuration } from "./explain";
export { describeEvidence } from "./evidence";
export { EventLifecycle, type LifecycleChanges, type LifecycleOptions } from "./lifecycle";

export interface RunResult {
  status: HistoryStatus;
  detections: Detection[];
}

/**
 * Runs every detector on one aircraft's track. Pure: no I/O, no clock reads.
 * Facts (glitch, gap, signal lost) are always reported. Behaviour detectors
 * run on the latest segment only, and only with enough history.
 */
export function runAll(track: Observation[], ctx: DetectContext): RunResult {
  const pre = preprocess(track, ctx.thresholds);
  const candidates: (Detection | null)[] = [
    pre.glitch,
    pre.gap,
    detectSignalLost(pre.points, ctx),
    // Self-confirming, so it runs even before a minute of history.
    ...detectTakeoffLanding(pre.points, ctx),
  ];

  if (pre.status === "ok") {
    candidates.push(detectClimbDescent(pre.latest, ctx), detectTurn(pre.latest, ctx));
  }

  return { status: pre.status, detections: candidates.filter((d): d is Detection => d !== null) };
}
