export type DataMode = "live" | "recorded" | "fixture";

export interface Observation {
  t: number; // epoch seconds, position time
  lat: number;
  lon: number;
  altFt: number | null; // null when unknown
  onGround: boolean;
  gsKt: number | null;
  trackDeg: number | null;
  baroRateFpm: number | null;
}

export interface AircraftState {
  hex: string;
  callsign: string | null;
  registration: string | null;
  typeCode: string | null;
  typeDesc: string | null;
  category: string | null;
  squawk: string | null;
  emergency: string | null;
  /** GPS (geometric) altitude, ft, for display only. Detectors use last.altFt (barometric). */
  altGeomFt: number | null;
  last: Observation;
  lastPosTs: number;
  mode: DataMode;
}

export type EventType =
  | "climb"
  | "descent"
  | "turn"
  | "circling"
  | "rapid_descent"
  | "signal_lost"
  | "glitch"
  | "gap"
  | "emergency"
  | "takeoff"
  | "landing";

export type Confidence = "observed" | "possible" | "fact";

export interface Explanation {
  seen: string; // what we see
  commonly?: string; // what this commonly means (optional for some types)
  cannotTell: string; // what the data can't confirm
}

export interface Detection {
  type: EventType;
  confidence: Confidence;
  windowStart: number;
  windowEnd: number;
  evidence: Record<string, number | string | boolean>;
}

export interface BehaviourEvent extends Detection {
  id: string;
  hex: string;
  mode: DataMode;
  status: "open" | "closed";
  explanation: Explanation;
  explanationSource: "template" | "llm";
  openedAt: number;
  updatedAt: number;
  closedAt: number | null;
}

/** Live feed health. "degraded" until the first successful poll. */
export type FeedStatus = "ok" | "degraded" | "down";
