import type { Airport, Thresholds } from "@aerotrack/shared";

export interface DetectContext {
  now: number; // epoch seconds (replay clock in recorded mode)
  lastPosTs: number;
  squawk: string | null;
  emergency: string | null;
  thresholds: Thresholds;
  /** Airports for "near {airport}". Defaults to the Sydney-region list; the api passes a worldwide one. */
  airports?: readonly Airport[];
}
