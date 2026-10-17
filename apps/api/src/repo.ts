import type { AircraftState, BehaviourEvent, DataMode, RecordingFile, RecordingMeta } from "@aerotrack/shared";
import type { NewObservation } from "./buffer";
import type { FollowEntry } from "./follows";
import type { Sighting } from "./sightings";

export interface PositionRow extends NewObservation {
  mode: DataMode;
}

export type StoredPosition = NewObservation;

/** Persistence used by the api. Postgres in production (db/repo.ts), fakes in tests. */
export interface Repo {
  insertPositions(rows: PositionRow[]): Promise<void>;
  upsertAircraft(states: AircraftState[]): Promise<void>;
  upsertEvents(events: BehaviourEvent[]): Promise<void>;
  /** Live positions with t >= sinceSec, oldest first. */
  loadPositionsSince(sinceSec: number): Promise<StoredPosition[]>;
  /** Identity rows for the given aircraft. */
  loadAircraft(hexes: string[]): Promise<Omit<AircraftState, "last" | "lastPosTs" | "squawk" | "emergency" | "altGeomFt" | "mode">[]>;
  loadOpenEvents(): Promise<BehaviourEvent[]>;
  /** Most recent events for one aircraft, newest first. */
  recentEvents(hex: string, limit: number): Promise<BehaviourEvent[]>;
  upsertSightings(list: Sighting[]): Promise<void>;
  /** Sightings with lastSeenAt >= sinceSec, to continue after a restart. */
  loadOpenSightings(sinceSec: number): Promise<Sighting[]>;
  /** All-time count and first sighting for one aircraft, plus ids of sightings started since sinceSec. */
  sightingSummary(hex: string, sinceSec: number): Promise<SightingSummary>;
  /** Live positions with fromSec <= t <= toSec, oldest first (for recordings). */
  loadPositionsBetween(fromSec: number, toSec: number): Promise<StoredPosition[]>;
  /** Insert or replace a recording by id. */
  saveRecording(rec: RecordingFile): Promise<void>;
  /** Recordings without their points, newest first. */
  listRecordings(): Promise<RecordingMeta[]>;
  getRecording(id: string): Promise<RecordingFile | null>;
  /** Replace the saved follow list. */
  saveFollows(list: FollowEntry[]): Promise<void>;
  loadFollows(): Promise<FollowEntry[]>;
}

export interface SightingSummary {
  total: number;
  firstSeenAt: number | null;
  recentIds: string[];
}
