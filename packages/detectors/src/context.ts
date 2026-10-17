import type { Thresholds } from "@aerotrack/shared";

export interface DetectContext {
  now: number; // epoch seconds (replay clock in recorded mode)
  lastPosTs: number;
  squawk: string | null;
  emergency: string | null;
  thresholds: Thresholds;
}
